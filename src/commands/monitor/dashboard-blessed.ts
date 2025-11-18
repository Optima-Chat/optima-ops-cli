import { Command } from 'commander';
import { handleError } from '../../utils/error.js';
import { BlessedDashboard } from '../../ui/blessed/BlessedDashboard.js';
import { getAllServices } from '../../utils/services-loader.js';
import { getCoreServices } from '../../utils/services-loader.js';
import { ECSService } from '../../services/aws/ecs-service.js';
import { ALBService } from '../../services/aws/alb-service.js';
import { SSHClient } from '../../utils/ssh.js';
import { getCurrentEnvConfig } from '../../utils/config.js';
import axios from 'axios';
import type { ServiceHealth, BlueGreenStatus, DockerStats } from '../../types/monitor.js';

export const dashboardBlessedCommand = new Command('dashboard-blessed')
  .description('Launch blessed-based TUI monitoring dashboard (no flicker)')
  .option('--env <environment>', 'Environment to monitor', 'production')
  .option('--interval <seconds>', 'Refresh interval in seconds', '5')
  .action(async (options) => {
    try {
      const environment = options.env;
      const refreshInterval = parseInt(options.interval, 10);

      // 创建 blessed dashboard
      const dashboard = new BlessedDashboard({
        environment,
        refreshInterval,
      });

      // 数据获取函数
      const fetchServices = async (): Promise<ServiceHealth[]> => {
        const allServices = getAllServices();
        const results = await Promise.all(
          allServices.map(async (svc) => {
            try {
              const startTime = Date.now();
              const response = await axios.get(svc.healthEndpoint, {
                timeout: 3000,
                maxRedirects: 0, // 307/308 视为异常
                validateStatus: () => true,
              });
              const responseTime = Date.now() - startTime;

              const health: 'healthy' | 'degraded' | 'unhealthy' =
                response.status === 200 || response.status === 404
                  ? 'healthy'
                  : 'unhealthy';

              return {
                name: svc.name,
                type: svc.type,
                health,
                responseTime,
                containerStatus: health === 'healthy' ? 'running' : 'stopped',
              } as ServiceHealth;
            } catch (err) {
              return {
                name: svc.name,
                type: svc.type,
                health: 'unhealthy',
                responseTime: 0,
                containerStatus: 'unknown',
                error: (err as Error).message,
              } as ServiceHealth;
            }
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

      const fetchDocker = async (): Promise<DockerStats[]> => {
        const config = getCurrentEnvConfig();
        const ssh = new SSHClient({
          host: config.ec2Host,
          username: 'ec2-user',
          privateKeyPath: process.env.OPTIMA_SSH_KEY || '~/.ssh/optima-ec2-key',
        });

        await ssh.connect();

        const result = await ssh.executeCommand(
          'docker stats --no-stream --format "{{.Container}}|{{.CPUPerc}}|{{.MemUsage}}|{{.NetIO}}"',
        );

        await ssh.disconnect();

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
          .filter((s): s is DockerStats => s !== null);

        return parsed;
      };

      // 定期刷新数据
      const updateData = async () => {
        try {
          const [services, blueGreen, docker] = await Promise.all([
            fetchServices(),
            fetchBlueGreen(),
            fetchDocker(),
          ]);

          dashboard.updateServices(services, false);
          dashboard.updateBlueGreen(blueGreen, false);
          dashboard.updateDocker(docker, false);
        } catch (err) {
          // 忽略错误，继续下次刷新
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
      });
    } catch (error) {
      handleError(error);
      process.exit(1);
    }
  });
