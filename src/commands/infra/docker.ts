import { Command } from 'commander';
import chalk from 'chalk';
import Table from 'cli-table3';
import { getCurrentEnvironment, Environment } from '../../utils/config.js';
import { SSHClient } from '../../utils/ssh.js';
import {
  isJsonOutput,
  outputSuccess,
  printTitle,
  printSection,
} from '../../utils/output.js';
import { handleError } from '../../utils/error.js';

interface ContainerStats {
  name: string;
  cpu_percent: string;
  memory_usage: string;
  memory_limit: string;
  memory_percent: string;
  network_io: string;
  block_io: string;
  pids: string;
}

interface DockerInfo {
  environment: string;
  containers: ContainerStats[];
  summary: {
    total_containers: number;
    running_containers: number;
    stopped_containers: number;
    total_images: number;
    docker_version?: string;
  };
}

export const dockerCommand = new Command('docker')
  .description('查看 Docker 容器资源使用情况')
  .option('--env <env>', '环境 (production/stage/development)')
  .option('--json', 'JSON 格式输出')
  .action(async (options) => {
    try {
      const env: Environment = options.env || getCurrentEnvironment();

      if (!isJsonOutput()) {
        printTitle(`🐳 Docker 容器资源使用 - ${env} 环境`);
      }

      const ssh = new SSHClient(env);
      await ssh.connect();

      const result: DockerInfo = {
        environment: env,
        containers: [],
        summary: {
          total_containers: 0,
          running_containers: 0,
          stopped_containers: 0,
          total_images: 0,
        },
      };

      try {
        // 获取 Docker 版本
        try {
          const versionResult = await ssh.executeCommand('docker version --format "{{.Server.Version}}"');
          result.summary.docker_version = versionResult.stdout.trim();
        } catch (error) {
          // Docker 版本获取失败，继续
        }

        // 获取容器统计信息
        const statsResult = await ssh.executeCommand(
          'docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}\t{{.NetIO}}\t{{.BlockIO}}\t{{.PIDs}}"'
        );

        const statsLines = statsResult.stdout.trim().split('\n');
        // 跳过表头
        for (let i = 1; i < statsLines.length; i++) {
          const line = statsLines[i]?.trim();
          if (!line) continue;

          const parts = line.split(/\t+/);
          if (parts.length >= 7 && parts[2]) {
            const memUsage = parts[2].split(' / ');
            result.containers.push({
              name: parts[0] || '',
              cpu_percent: parts[1] || '0%',
              memory_usage: memUsage[0] || parts[2],
              memory_limit: memUsage[1] || 'N/A',
              memory_percent: parts[3] || '0%',
              network_io: parts[4] || '0B / 0B',
              block_io: parts[5] || '0B / 0B',
              pids: parts[6] || '0',
            });
          }
        }

        // 获取容器数量统计
        const psAllResult = await ssh.executeCommand('docker ps -a --format "{{.State}}"');
        const states = psAllResult.stdout.trim().split('\n');
        result.summary.total_containers = states.length;
        result.summary.running_containers = states.filter(s => s === 'running').length;
        result.summary.stopped_containers = states.filter(s => s !== 'running').length;

        // 获取镜像数量
        const imagesResult = await ssh.executeCommand('docker images --format "{{.ID}}" | wc -l');
        result.summary.total_images = parseInt(imagesResult.stdout.trim()) || 0;
      } catch (error: any) {
        throw new Error(`获取 Docker 信息失败: ${error.message}`);
      } finally {
        await ssh.disconnect();
      }

      // 输出结果
      if (isJsonOutput()) {
        outputSuccess(result);
      } else {
        // 显示汇总信息
        printSection('Docker 概览');
        const summaryTable = new Table({
          colWidths: [25, 30],
          wordWrap: true,
        });
        summaryTable.push(
          ['Docker 版本', result.summary.docker_version || 'N/A'],
          ['容器总数', result.summary.total_containers.toString()],
          ['运行中', chalk.green(result.summary.running_containers.toString())],
          ['已停止', result.summary.stopped_containers > 0 ? chalk.yellow(result.summary.stopped_containers.toString()) : result.summary.stopped_containers.toString()],
          ['镜像总数', result.summary.total_images.toString()]
        );
        console.log(summaryTable.toString());

        // 显示容器资源使用
        if (result.containers.length > 0) {
          printSection('容器资源使用');
          const containerTable = new Table({
            head: ['容器名称', 'CPU %', '内存使用', '内存限制', '内存 %', '网络 I/O', '磁盘 I/O', 'PIDs'],
            colWidths: [30, 10, 12, 12, 10, 18, 18, 8],
            wordWrap: true,
          });

          for (const container of result.containers) {
            // CPU 警告：超过 80% 标红
            let cpuDisplay = container.cpu_percent;
            const cpuValue = parseFloat(container.cpu_percent);
            if (cpuValue > 80) {
              cpuDisplay = chalk.red(container.cpu_percent);
            } else if (cpuValue > 50) {
              cpuDisplay = chalk.yellow(container.cpu_percent);
            }

            // 内存警告：超过 80% 标红
            let memDisplay = container.memory_percent;
            const memValue = parseFloat(container.memory_percent);
            if (memValue > 80) {
              memDisplay = chalk.red(container.memory_percent);
            } else if (memValue > 50) {
              memDisplay = chalk.yellow(container.memory_percent);
            }

            containerTable.push([
              container.name,
              cpuDisplay,
              container.memory_usage,
              container.memory_limit,
              memDisplay,
              container.network_io,
              container.block_io,
              container.pids,
            ]);
          }
          console.log(containerTable.toString());

          // 资源警告
          const highCPU = result.containers.filter(c => parseFloat(c.cpu_percent) > 80);
          const highMem = result.containers.filter(c => parseFloat(c.memory_percent) > 80);

          if (highCPU.length > 0 || highMem.length > 0) {
            console.log();
            if (highCPU.length > 0) {
              console.log(chalk.red(`⚠️  CPU 使用率过高的容器 (>80%):`));
              for (const container of highCPU) {
                console.log(chalk.gray(`  - ${container.name}: ${container.cpu_percent}`));
              }
            }
            if (highMem.length > 0) {
              console.log(chalk.red(`⚠️  内存使用率过高的容器 (>80%):`));
              for (const container of highMem) {
                console.log(chalk.gray(`  - ${container.name}: ${container.memory_percent} (${container.memory_usage})`));
              }
            }
          }
        } else {
          console.log(chalk.yellow('\n未找到运行中的容器'));
        }

        // 提示
        console.log();
        console.log(chalk.gray('💡 提示:'));
        console.log(chalk.gray('  - 使用 optima-ops services status 查看容器详细状态'));
        console.log(chalk.gray('  - 使用 optima-ops services logs <service> 查看容器日志'));
        console.log(chalk.gray('  - 使用 optima-ops infra disk 查看磁盘使用情况'));
      }
    } catch (error) {
      handleError(error);
    }
  });
