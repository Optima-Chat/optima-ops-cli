import { Command } from 'commander';
import { handleError } from '../../utils/error.js';
import { BlessedDashboard } from '../../ui/blessed/BlessedDashboard.js';
import { getAllServices } from '../../utils/services-loader.js';
import axios from 'axios';
import type {
  ServiceHealth,
  EC2Stats,
} from '../../types/monitor.js';
import { dashboardLogger } from '../../utils/dashboard-logger.js';
import { Client as SSH2Client } from 'ssh2';
import fs from 'fs';

export const legacyDashboardCommand = new Command('legacy')
  .description('经典单面板监控仪表盘（无闪烁版本）')
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
            maxRedirects: 0, // stage MCP 307 必须返回给调用方
            validateStatus: () => true, // 接受所有状态码，不抛异常
          });
          const responseTime = Date.now() - startTime;

          // 只有 200 和 404 为健康，其他所有状态（包括 307, 502 等）都为不健康
          const health: 'healthy' | 'degraded' | 'unhealthy' =
            response.status === 200 || response.status === 404 ? 'healthy' : 'unhealthy';

          return {
            health,
            responseTime: health === 'healthy' ? responseTime : 0, // 不健康时不显示响应时间
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

      // 获取单个环境的 EC2 资源
      const fetchEC2ForEnv = async (env: 'production' | 'stage' | 'shared'): Promise<EC2Stats | null> => {
        try {
          const hostMap = {
            production: 'ec2-prod.optima.shop',
            stage: 'ec2-stage.optima.shop',
            shared: '13.251.46.219',
          };
          const host = hostMap[env];

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
        const [prodStats, stageStats, sharedStats] = await Promise.all([
          fetchEC2ForEnv('production'),
          fetchEC2ForEnv('stage'),
          fetchEC2ForEnv('shared'),
        ]);

        return [prodStats, stageStats, sharedStats].filter((s): s is EC2Stats => s !== null);
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

          dashboard.updateServices(services, false);
          dashboard.updateEC2(ec2, false);
        } catch (err) {
          dashboardLogger.error('updateData failed', err as Error);
        }
      };

      // 初始加载
      dashboard.updateServices([], true);
      dashboard.updateEC2([], true);

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
