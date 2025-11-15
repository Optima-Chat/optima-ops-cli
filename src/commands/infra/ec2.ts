import { Command } from 'commander';
import chalk from 'chalk';
import Table from 'cli-table3';
import { getCurrentEnvironment, getCurrentEnvConfig, Environment } from '../../utils/config.js';
import { SSHClient } from '../../utils/ssh.js';
import { getEC2Instance, findEC2InstanceByEnvironment } from '../../utils/aws/ec2.js';
import { CommandTimer, isTimingEnabled } from '../../utils/timer.js';
import {
  isJsonOutput,
  outputSuccess,
  printTitle,
  printSection,
} from '../../utils/output.js';
import { handleError } from '../../utils/error.js';

interface EC2Info {
  environment: string;
  instance: {
    id: string;
    type: string;
    state: string;
    public_ip?: string;
    private_ip?: string;
    launch_time?: string;
    availability_zone?: string;
  };
  system: {
    uptime: string;
    cpu_count?: number;
    memory_total?: string;
    memory_used?: string;
    memory_free?: string;
    load_average?: string;
  };
  disk: {
    root: {
      total?: string;
      used?: string;
      available?: string;
      use_percentage?: string;
    };
    data: {
      total?: string;
      used?: string;
      available?: string;
      use_percentage?: string;
    };
  };
  network: {
    hostname?: string;
    interfaces?: Array<{
      name: string;
      ip: string;
      rx_bytes?: string;
      tx_bytes?: string;
    }>;
  };
}

export const ec2Command = new Command('ec2')
  .description('查看 EC2 实例信息和资源使用情况')
  .option('--env <env>', '环境 (production/stage/development)')
  .option('--json', 'JSON 格式输出')
  .action(async (options) => {
    try {
      const timer = new CommandTimer();
      const env: Environment = options.env || getCurrentEnvironment();
      const envConfig = getCurrentEnvConfig();

      if (!isJsonOutput()) {
        printTitle(`🖥️  EC2 实例信息 - ${env} 环境`);
      }

      // 动态查找 EC2 实例
      const instanceId = await findEC2InstanceByEnvironment(envConfig.ec2Environment);
      timer.step('查找 EC2 实例');

      if (!instanceId) {
        throw new Error(`未找到环境 ${envConfig.ec2Environment} 的 EC2 实例`);
      }

      // 获取 AWS EC2 实例信息
      const instanceInfo = await getEC2Instance(instanceId);
      timer.step('获取实例信息');
      if (!instanceInfo) {
        throw new Error(`无法获取 EC2 实例信息: ${instanceId}`);
      }

      // 获取实例状态（暂时注释，未使用）
      // const instanceStatus = await getEC2InstanceStatus(envConfig.ec2InstanceId);

      // 通过 SSH 获取实时系统信息
      const ssh = new SSHClient(env);
      await ssh.connect();

      const result: EC2Info = {
        environment: env,
        instance: {
          id: instanceInfo.InstanceId || 'unknown',
          type: instanceInfo.InstanceType || 'unknown',
          state: instanceInfo.State?.Name || 'unknown',
          public_ip: instanceInfo.PublicIpAddress,
          private_ip: instanceInfo.PrivateIpAddress,
          launch_time: instanceInfo.LaunchTime?.toISOString(),
          availability_zone: instanceInfo.Placement?.AvailabilityZone,
        },
        system: {
          uptime: '',
          memory_total: '',
          memory_used: '',
          memory_free: '',
          load_average: '',
        },
        disk: {
          root: {},
          data: {},
        },
        network: {
          hostname: '',
          interfaces: [],
        },
      };

      try {
        // 获取系统运行时间
        const uptimeResult = await ssh.executeCommand('uptime -p');
        result.system.uptime = uptimeResult.stdout.trim();

        // 获取 CPU 核心数
        const cpuResult = await ssh.executeCommand('nproc');
        result.system.cpu_count = parseInt(cpuResult.stdout.trim());

        // 获取负载平均值
        const loadResult = await ssh.executeCommand('cat /proc/loadavg | cut -d" " -f1-3');
        result.system.load_average = loadResult.stdout.trim();

        // 获取内存信息
        const memResult = await ssh.executeCommand('free -h | grep Mem:');
        const memParts = memResult.stdout.trim().split(/\s+/);
        if (memParts.length >= 7) {
          result.system.memory_total = memParts[1];
          result.system.memory_used = memParts[2];
          result.system.memory_free = memParts[3];
        }

        // 获取磁盘使用情况
        const diskResult = await ssh.executeCommand('df -h');
        const diskLines = diskResult.stdout.trim().split('\n');
        for (const line of diskLines) {
          if (line.includes('/dev/nvme0n1p1') || line.includes(' /$')) {
            const parts = line.split(/\s+/);
            if (parts.length >= 6) {
              result.disk.root = {
                total: parts[1],
                used: parts[2],
                available: parts[3],
                use_percentage: parts[4],
              };
            }
          } else if (line.includes('/dev/nvme1n1') || line.includes('/data')) {
            const parts = line.split(/\s+/);
            if (parts.length >= 6) {
              result.disk.data = {
                total: parts[1],
                used: parts[2],
                available: parts[3],
                use_percentage: parts[4],
              };
            }
          }
        }

        // 获取主机名
        const hostnameResult = await ssh.executeCommand('hostname');
        result.network.hostname = hostnameResult.stdout.trim();

        // 获取网络接口信息
        const ifconfigResult = await ssh.executeCommand('ip -s -o addr show | grep -E "eth0|ens"');
        const ifLines = ifconfigResult.stdout.trim().split('\n');
        for (const line of ifLines) {
          const match = line.match(/^\d+:\s+(\S+)\s+inet\s+([0-9.]+)/);
          if (match && match[1] && match[2]) {
            result.network.interfaces?.push({
              name: match[1],
              ip: match[2],
            });
          }
        }
      } catch (error: any) {
        // SSH 命令失败时继续，但记录错误
        if (!isJsonOutput()) {
          console.warn(chalk.yellow(`⚠️  部分系统信息获取失败: ${error.message}`));
        }
      } finally {
        await ssh.disconnect();
      }

      // 输出结果
      timer.step('数据处理');

      if (isJsonOutput()) {
        const output = {
          ...result,
          _timing: isTimingEnabled() ? timer.getTimingData() : undefined,
        };
        outputSuccess(output);
      } else {
        // 实例基本信息
        printSection('实例信息');
        const instanceTable = new Table({
          colWidths: [25, 50],
          wordWrap: true,
        });
        instanceTable.push(
          ['实例 ID', result.instance.id],
          ['实例类型', result.instance.type],
          ['状态', result.instance.state === 'running' ? chalk.green(result.instance.state) : chalk.yellow(result.instance.state)],
          ['可用区', result.instance.availability_zone || 'N/A'],
          ['公网 IP', result.instance.public_ip || 'N/A'],
          ['私网 IP', result.instance.private_ip || 'N/A'],
          ['启动时间', result.instance.launch_time ? new Date(result.instance.launch_time).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }) : 'N/A']
        );
        console.log(instanceTable.toString());

        // 系统资源
        printSection('系统资源');
        const systemTable = new Table({
          colWidths: [25, 50],
          wordWrap: true,
        });
        systemTable.push(
          ['运行时间', result.system.uptime || 'N/A'],
          ['CPU 核心数', result.system.cpu_count ? result.system.cpu_count.toString() : 'N/A'],
          ['负载平均值', result.system.load_average || 'N/A'],
          ['内存总量', result.system.memory_total || 'N/A'],
          ['内存已用', result.system.memory_used || 'N/A'],
          ['内存可用', result.system.memory_free || 'N/A']
        );
        console.log(systemTable.toString());

        // 磁盘使用
        printSection('磁盘使用');
        const diskTable = new Table({
          head: ['挂载点', '总量', '已用', '可用', '使用率'],
          colWidths: [15, 12, 12, 12, 12],
        });
        diskTable.push(
          [
            '/ (root)',
            result.disk.root.total || 'N/A',
            result.disk.root.used || 'N/A',
            result.disk.root.available || 'N/A',
            result.disk.root.use_percentage ? (parseInt(result.disk.root.use_percentage) > 85 ? chalk.red(result.disk.root.use_percentage) : result.disk.root.use_percentage) : 'N/A',
          ],
          [
            '/data',
            result.disk.data.total || 'N/A',
            result.disk.data.used || 'N/A',
            result.disk.data.available || 'N/A',
            result.disk.data.use_percentage ? (parseInt(result.disk.data.use_percentage) > 85 ? chalk.red(result.disk.data.use_percentage) : result.disk.data.use_percentage) : 'N/A',
          ]
        );
        console.log(diskTable.toString());

        // 网络信息
        if (result.network.interfaces && result.network.interfaces.length > 0) {
          printSection('网络接口');
          const networkTable = new Table({
            head: ['接口', 'IP 地址'],
            colWidths: [20, 30],
          });
          for (const iface of result.network.interfaces) {
            networkTable.push([iface.name, iface.ip]);
          }
          console.log(networkTable.toString());
        }

        // 磁盘使用警告
        const rootUsage = result.disk.root.use_percentage ? parseInt(result.disk.root.use_percentage) : 0;
        const dataUsage = result.disk.data.use_percentage ? parseInt(result.disk.data.use_percentage) : 0;
        if (rootUsage > 85 || dataUsage > 85) {
          console.log();
          console.log(chalk.red('⚠️  磁盘使用率超过 85%，建议清理:'));
          console.log(chalk.gray('  docker system prune -a -f --volumes'));
        }

        if (isTimingEnabled()) {
          timer.printSummary();
        }
      }
    } catch (error) {
      handleError(error);
    }
  });
