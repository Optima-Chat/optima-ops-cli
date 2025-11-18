import { Command } from 'commander';
import { handleError } from '../../utils/error.js';
import { BlessedDashboard } from '../../ui/blessed/BlessedDashboard.js';
import { getAllServices } from '../../utils/services-loader.js';
import { getCoreServices } from '../../utils/services-loader.js';
import { ECSService } from '../../services/aws/ecs-service.js';
import { SSHClient } from '../../utils/ssh.js';
import { getCurrentEnvConfig } from '../../utils/config.js';
import axios from 'axios';
import type {
  ServiceHealth,
  BlueGreenStatus,
  DockerStats,
  EC2Stats,
} from '../../types/monitor.js';
import { dashboardLogger } from '../../utils/dashboard-logger.js';
import { Client as SSH2Client } from 'ssh2';
import fs from 'fs';

export const dashboardCommand = new Command('dashboard')
  .description('Launch interactive TUI monitoring dashboard (blessed-based, no flicker)')
  .option('--env <environment>', 'Environment to monitor', 'production')
  .option('--interval <seconds>', 'Refresh interval in seconds', '5')
  .action(async (options) => {
    try {
      const environment = options.env;
      const refreshInterval = parseInt(options.interval, 10);

      // 日志信息
      dashboardLogger.info('Dashboard started', {
        environment,
        refreshInterval,
      });
      console.log(`📊 Dashboard starting... (logs: ${dashboardLogger.getLogPath()})`);

      // 创建 blessed dashboard
      const dashboard = new BlessedDashboard({
        environment,
        refreshInterval,
      });

      // 辅助函数：简单的 SSH 命令执行
      const executeSSHCommand = async (
        host: string,
        command: string,
      ): Promise<string> => {
        return new Promise((resolve, reject) => {
          const conn = new SSH2Client();
          const keyPath = process.env.OPTIMA_SSH_KEY || `${process.env.HOME}/.ssh/optima-ec2-key`;
          const privateKey = fs.readFileSync(keyPath, 'utf8');

          conn
            .on('ready', () => {
              conn.exec(command, (err, stream) => {
                if (err) {
                  conn.end();
                  reject(err);
                  return;
                }

                let stdout = '';
                let stderr = '';

                stream
                  .on('close', () => {
                    conn.end();
                    if (stderr) {
                      reject(new Error(stderr));
                    } else {
                      resolve(stdout);
                    }
                  })
                  .on('data', (data: Buffer) => {
                    stdout += data.toString();
                  })
                  .stderr.on('data', (data: Buffer) => {
                    stderr += data.toString();
                  });
              });
            })
            .on('error', (err) => {
              reject(err);
            })
            .connect({
              host,
              port: 22,
              username: 'ec2-user',
              privateKey,
            });
        });
      };

      // 获取单个环境的健康状态
      const fetchEnvironmentHealth = async (
        healthEndpoint: string,
      ): Promise<import('../../types/monitor.js').EnvironmentHealth> => {
        try {
          const startTime = Date.now();
          const response = await axios.get(healthEndpoint, {
            timeout: 3000,
            validateStatus: () => true, // 接受所有状态码，不抛异常
          });
          const responseTime = Date.now() - startTime;

          // 只有 200 和 404 为健康，其他所有状态（包括 307, 502 等）都为不健康
          const health: 'healthy' | 'degraded' | 'unhealthy' =
            response.status === 200 || response.status === 404 ? 'healthy' : 'unhealthy';

          return {
            health,
            responseTime,
            containerStatus: health === 'healthy' ? 'running' : 'stopped',
          };
        } catch (err) {
          // 网络错误、超时等
          return {
            health: 'unhealthy',
            responseTime: 0,
            containerStatus: 'unknown',
            error: (err as Error).message,
          };
        }
      };

      // 数据获取函数（同时获取 prod 和 stage）
      const fetchServices = async (): Promise<ServiceHealth[]> => {
        const allServices = getAllServices();
        const results = await Promise.all(
          allServices.map(async (svc) => {
            // prod 环境 URL
            const prodUrl = svc.healthEndpoint;

            // stage 环境 URL（替换域名）
            const stageUrl = prodUrl
              .replace('auth.optima.shop', 'auth-stage.optima.shop')
              .replace('mcp.optima.shop', 'mcp-stage.optima.shop')
              .replace('api.optima.shop', 'api-stage.optima.shop')
              .replace('ai.optima.shop', 'ai-stage.optima.shop')
              .replace('mcp-comfy.optima.shop', 'mcp-comfy-stage.optima.shop')
              .replace('mcp-fetch.optima.shop', 'mcp-fetch-stage.optima.shop')
              .replace('mcp-research.optima.shop', 'mcp-research-stage.optima.shop')
              .replace('mcp-shopify.optima.shop', 'mcp-shopify-stage.optima.shop')
              .replace('mcp-commerce.optima.shop', 'mcp-commerce-stage.optima.shop')
              .replace('mcp-ads.optima.shop', 'mcp-ads-stage.optima.shop');

            // 并行获取两个环境的状态
            const [prod, stage] = await Promise.all([
              fetchEnvironmentHealth(prodUrl),
              fetchEnvironmentHealth(stageUrl),
            ]);

            return {
              name: svc.name,
              type: svc.type,
              prod,
              stage,
            } as ServiceHealth;
          }),
        );
        return results;
      };

      const fetchBlueGreen = async (): Promise<BlueGreenStatus[]> => {
        const ecsService = new ECSService();
        const coreServices = getCoreServices();
        const services = coreServices.map((s) => s.name);
        const cluster =
          environment === 'production' ? 'optima-prod' : 'optima-stage';

        const results = await Promise.all(
          services.map(async (service) => {
            const [blue, green] = await Promise.all([
              ecsService.getServiceTasks(cluster, `optima-${service}-blue`),
              ecsService.getServiceTasks(cluster, `optima-${service}-green`),
            ]);

            return {
              service,
              blue,
              green,
              traffic: { blue: 100, green: 0 },
            };
          }),
        );

        return results;
      };

      // 辅助函数：解析内存单位
      const parseMemory = (str: string): number => {
        const match = str.match(/^([\d.]+)([A-Za-z]+)$/);
        if (!match) return 0;

        const value = parseFloat(match[1] || '0');
        const unit = match[2]?.toUpperCase();

        const multipliers: Record<string, number> = {
          B: 1,
          KB: 1024,
          KIB: 1024,
          MB: 1024 * 1024,
          MIB: 1024 * 1024,
          GB: 1024 * 1024 * 1024,
          GIB: 1024 * 1024 * 1024,
        };

        return value * (multipliers[unit || 'B'] || 1);
      };

      // 获取单个环境的 Docker 数据
      const fetchDockerForEnv = async (
        env: 'production' | 'stage',
      ): Promise<import('../../types/monitor.js').ContainerStats[]> => {
        try {
          const host = env === 'production' ? 'ec2-prod.optima.shop' : 'ec2-stage.optima.shop';

          const stdout = await executeSSHCommand(
            host,
            'docker stats --no-stream --format "{{.Name}}|{{.CPUPerc}}|{{.MemUsage}}|{{.NetIO}}"',
          );

          const lines = stdout.trim().split('\n');
          const parsed = lines
            .map((line) => {
              const [container, cpu, mem, net] = line.split('|');

              if (!container) return null;

              const cpuPercent = parseFloat(cpu?.replace('%', '') || '0');
              const memParts = mem?.split(' / ') || [];
              const memoryUsed = parseMemory(memParts[0] || '0');
              const memoryTotal = parseMemory(memParts[1] || '0');
              const netParts = net?.split(' / ') || [];
              const networkRx = parseMemory(netParts[0] || '0');
              const networkTx = parseMemory(netParts[1] || '0');

              return {
                container,
                cpuPercent,
                memoryUsed,
                memoryTotal,
                networkRx,
                networkTx,
              };
            })
            .filter(
              (s): s is import('../../types/monitor.js').ContainerStats => s !== null,
            );

          return parsed;
        } catch (err) {
          dashboardLogger.error(`fetchDockerForEnv ${env} failed`, err as Error);
          return [];
        }
      };

      // 获取所有环境的 Docker 数据
      const fetchDocker = async (): Promise<DockerStats[]> => {
        const [prodStats, stageStats] = await Promise.all([
          fetchDockerForEnv('production'),
          fetchDockerForEnv('stage'),
        ]);

        return [
          { environment: 'production', stats: prodStats },
          { environment: 'stage', stats: stageStats },
        ];
      };

      // 获取单个环境的 EC2 资源
      const fetchEC2ForEnv = async (env: 'production' | 'stage'): Promise<EC2Stats | null> => {
        try {
          const host = env === 'production' ? 'ec2-prod.optima.shop' : 'ec2-stage.optima.shop';

          // 获取内存信息
          const memResult = await executeSSHCommand(host, 'free -m | grep Mem');
          const memParts = memResult.trim().split(/\s+/);
          const memoryTotal = parseInt(memParts[1] || '0', 10);
          const memoryUsed = parseInt(memParts[2] || '0', 10);

          // 获取所有磁盘信息 (df -h 显示所有挂载点)
          const allDisksResult = await executeSSHCommand(host, 'df -BG | grep -E "^/dev/" | grep -v "loop"');
          const diskLines = allDisksResult.trim().split('\n');
          const disks: import('../../types/monitor.js').DiskStats[] = diskLines.map((line) => {
            const parts = line.trim().split(/\s+/);
            const total = parseInt(parts[1]?.replace('G', '') || '0', 10);
            const used = parseInt(parts[2]?.replace('G', '') || '0', 10);
            const percent = parseInt(parts[4]?.replace('%', '') || '0', 10);
            const mountPoint = parts[5] || '';
            return { mountPoint, used, total, percent };
          });

          // Root 卷信息 (向后兼容)
          const diskResult = await executeSSHCommand(host, 'df -BG / | tail -1');
          const diskParts = diskResult.trim().split(/\s+/);
          const diskTotal = parseInt(diskParts[1]?.replace('G', '') || '0', 10);
          const diskUsed = parseInt(diskParts[2]?.replace('G', '') || '0', 10);

          // 获取 uptime
          const uptimeResult = await executeSSHCommand(host, 'uptime -p');
          const uptime = uptimeResult.trim().replace('up ', '');

          // 获取实例元数据
          const instanceIdResult = await executeSSHCommand(
            host,
            'ec2-metadata --instance-id 2>/dev/null | cut -d " " -f 2 || echo "unknown"',
          );
          const instanceTypeResult = await executeSSHCommand(
            host,
            'ec2-metadata --instance-type 2>/dev/null | cut -d " " -f 2 || echo "unknown"',
          );

          return {
            environment: env,
            instanceId: instanceIdResult.trim() || 'unknown',
            instanceType: instanceTypeResult.trim() || 'unknown',
            memoryUsed,
            memoryTotal,
            diskUsed,
            diskTotal,
            disks,
            uptime,
          };
        } catch (err) {
          dashboardLogger.error(`fetchEC2ForEnv ${env} failed`, err as Error);
          return null;
        }
      };

      // 获取所有环境的 EC2 数据
      const fetchEC2 = async (): Promise<EC2Stats[]> => {
        const [prodStats, stageStats] = await Promise.all([
          fetchEC2ForEnv('production'),
          fetchEC2ForEnv('stage'),
        ]);

        return [prodStats, stageStats].filter((s): s is EC2Stats => s !== null);
      };

      // 定期刷新数据
      const updateData = async () => {
        try {
          // 服务健康检查 - 已启用
          const services = await fetchServices().catch((err) => {
            dashboardLogger.error('fetchServices failed', err);
            return [];
          });

          // EC2 资源 - 已启用
          const ec2 = await fetchEC2().catch((err) => {
            dashboardLogger.error('fetchEC2 failed', err);
            return [];
          });

          // Docker 资源 - 已启用
          const docker = await fetchDocker().catch((err) => {
            dashboardLogger.error('fetchDocker failed', err);
            return [];
          });

          dashboard.updateServices(services, false);
          dashboard.updateBlueGreen(ec2, false);
          dashboard.updateDocker(docker, false);
        } catch (err) {
          dashboardLogger.error('updateData failed', err as Error);
        }
      };

      // 初始加载
      dashboard.updateServices([], true);
      dashboard.updateBlueGreen([], true);
      dashboard.updateDocker([], true);

      // 立即获取一次数据
      await updateData();

      // 定期刷新
      const timer = setInterval(updateData, refreshInterval * 1000);

      // 清理
      process.on('exit', () => {
        clearInterval(timer);
        dashboard.destroy();
        dashboardLogger.info('Dashboard stopped');
        dashboardLogger.close();
      });
    } catch (error) {
      dashboardLogger.error('Dashboard startup failed', error as Error);
      handleError(error);
      dashboardLogger.close();
      process.exit(1);
    }
  });
