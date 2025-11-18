import { Command } from 'commander';
import { handleError } from '../../utils/error.js';
import { BlessedDashboard } from '../../ui/blessed/BlessedDashboard.js';
import { getAllServices } from '../../utils/services-loader.js';
import { getCoreServices } from '../../utils/services-loader.js';
import { ECSService } from '../../services/aws/ecs-service.js';
import { SSHClient } from '../../utils/ssh.js';
import { getCurrentEnvConfig } from '../../utils/config.js';
import axios from 'axios';
import type { ServiceHealth, BlueGreenStatus, DockerStats } from '../../types/monitor.js';
import { dashboardLogger } from '../../utils/dashboard-logger.js';

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

      // 获取单个环境的健康状态
      const fetchEnvironmentHealth = async (
        healthEndpoint: string,
      ): Promise<import('../../types/monitor.js').EnvironmentHealth> => {
        try {
          const startTime = Date.now();
          const response = await axios.get(healthEndpoint, {
            timeout: 3000,
            validateStatus: (status) => status < 500,
          });
          const responseTime = Date.now() - startTime;

          // 200 和 404 为健康，307 等重定向为不健康
          const health: 'healthy' | 'degraded' | 'unhealthy' =
            response.status === 200 || response.status === 404 ? 'healthy' : 'unhealthy';

          return {
            health,
            responseTime,
            containerStatus: health === 'healthy' ? 'running' : 'stopped',
          };
        } catch (err) {
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
          const ssh = new SSHClient({
            host,
            username: 'ec2-user',
            privateKeyPath: process.env.OPTIMA_SSH_KEY || '~/.ssh/optima-ec2-key',
          });

          await ssh.connect();

          const result = await ssh.executeCommand(
            'docker stats --no-stream --format "{{.Name}}|{{.CPUPerc}}|{{.MemUsage}}|{{.NetIO}}"',
          );

          await ssh.disconnect();

          const lines = result.stdout.trim().split('\n');
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

      // 定期刷新数据
      const updateData = async () => {
        try {
          // 服务健康检查 - 已启用
          const services = await fetchServices().catch((err) => {
            dashboardLogger.error('fetchServices failed', err);
            return [];
          });

          // 蓝绿部署 - 暂时禁用
          // const blueGreen = await fetchBlueGreen().catch((err) => {
          //   dashboardLogger.error('fetchBlueGreen failed', err);
          //   return [];
          // });
          const blueGreen: BlueGreenStatus[] = [];

          // Docker 资源 - 已启用
          const docker = await fetchDocker().catch((err) => {
            dashboardLogger.error('fetchDocker failed', err);
            return [];
          });

          dashboard.updateServices(services, false);
          dashboard.updateBlueGreen(blueGreen, false);
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
