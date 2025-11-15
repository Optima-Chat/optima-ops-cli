import { Command } from 'commander';
import chalk from 'chalk';
import { getCurrentEnvironment, Environment, getAllServices, getServicesByType, getServiceConfig } from '../../utils/config.js';
import { SSHClient } from '../../utils/ssh.js';
import {
  isJsonOutput,
  outputSuccess,
  printTitle,
  createTable,
} from '../../utils/output.js';
import { handleError } from '../../utils/error.js';

export const statusCommand = new Command('status')
  .description('查看容器状态')
  .option('--env <env>', '环境 (production/stage/development)')
  .option('--service <service>', '特定服务名称')
  .option('--type <type>', '服务类型 (core/mcp/all)', 'all')
  .option('--json', 'JSON 格式输出')
  .action(async (options) => {
    try {
      const env: Environment = options.env || getCurrentEnvironment();

      // 获取服务列表
      let targetServices;
      if (options.service) {
        const serviceConfig = getServiceConfig(options.service);
        if (!serviceConfig) {
          throw new Error(`未知服务: ${options.service}`);
        }
        targetServices = [serviceConfig];
      } else {
        // 根据类型过滤
        if (options.type === 'core') {
          targetServices = getServicesByType('core');
        } else if (options.type === 'mcp') {
          targetServices = getServicesByType('mcp');
        } else {
          targetServices = getAllServices();
        }
      }

      if (!isJsonOutput()) {
        printTitle(`📦 容器状态 - ${env} 环境`);
      }

      // 连接 SSH
      const ssh = new SSHClient(env);
      await ssh.connect();

      try {
        // 获取容器名称
        const containerNames = targetServices.map(s => s.container);

        const results: any[] = [];

        for (let i = 0; i < containerNames.length; i++) {
          const containerName = containerNames[i];
          const serviceConfig = targetServices[i];
          const service = serviceConfig.name;

          if (!isJsonOutput()) {
            process.stdout.write(chalk.white(`检查 ${service}... `));
          }

          try {
            // 获取容器详细状态
            const statusResult = await ssh.executeCommand(
              `docker ps -a --filter "name=${containerName}" --format "{{.ID}}\\t{{.Names}}\\t{{.Status}}\\t{{.Image}}\\t{{.Ports}}"`
            );

            if (!statusResult.stdout.trim()) {
              results.push({
                service,
                container_name: containerName,
                status: 'not_found',
                message: '容器不存在',
              });

              if (!isJsonOutput()) {
                console.log(chalk.red('✗ 容器不存在'));
              }
              continue;
            }

            const [id, name, status, image, ports] = statusResult.stdout.trim().split('\t');

            // 解析状态
            const isRunning = status ? status.startsWith('Up') : false;
            const uptime = isRunning && status ? status.replace('Up ', '') : null;

            // 获取资源使用（如果运行中）
            let cpu = null;
            let memory = null;
            if (isRunning) {
              try {
                const statsResult = await ssh.executeCommand(
                  `docker stats --no-stream --format "{{.CPUPerc}}\\t{{.MemUsage}}" ${id}`,
                  { timeout: 5000 }
                );
                if (statsResult.exitCode === 0) {
                  const [cpuRaw, memRaw] = statsResult.stdout.trim().split('\t');
                  cpu = cpuRaw;
                  memory = memRaw;
                }
              } catch (error) {
                // 忽略统计错误
              }
            }

            results.push({
              service,
              container_name: name,
              container_id: id ? id.substring(0, 12) : '',
              status: isRunning ? 'running' : 'stopped',
              uptime,
              image,
              ports,
              cpu,
              memory,
            });

            if (!isJsonOutput()) {
              if (isRunning) {
                console.log(chalk.green(`✓ 运行中 (${uptime})`));
              } else {
                console.log(chalk.yellow(`⚠ 已停止`));
              }
            }
          } catch (error: any) {
            results.push({
              service,
              container_name: containerName,
              status: 'error',
              error: error.message,
            });

            if (!isJsonOutput()) {
              console.log(chalk.red(`✗ 错误: ${error.message}`));
            }
          }
        }

        ssh.disconnect();

        // 输出结果
        if (isJsonOutput()) {
          outputSuccess({
            environment: env,
            containers: results,
            summary: {
              total: results.length,
              running: results.filter(r => r.status === 'running').length,
              stopped: results.filter(r => r.status === 'stopped').length,
              not_found: results.filter(r => r.status === 'not_found').length,
              error: results.filter(r => r.status === 'error').length,
            },
          });
        } else {
          // 打印表格
          console.log();
          const table = createTable({
            head: ['服务', '容器ID', '状态', '运行时间', 'CPU', '内存'],
          });

          for (const result of results) {
            const statusText = result.status === 'running'
              ? chalk.green('运行中')
              : result.status === 'stopped'
              ? chalk.yellow('已停止')
              : result.status === 'not_found'
              ? chalk.red('不存在')
              : chalk.red('错误');

            table.push([
              result.service,
              result.container_id || '-',
              statusText,
              result.uptime || '-',
              result.cpu || '-',
              result.memory || '-',
            ]);
          }

          console.log(table.toString());

          // 打印总结
          const running = results.filter(r => r.status === 'running').length;
          const total = results.length;
          console.log(chalk.white(`\n总计: ${running}/${total} 运行中\n`));
        }
      } finally {
        ssh.disconnect();
      }
    } catch (error) {
      handleError(error);
    }
  });
