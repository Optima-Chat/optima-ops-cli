import { useState, useEffect } from 'react';
import { ECSService } from '../../services/aws/ecs-service.js';
import { ALBService } from '../../services/aws/alb-service.js';
import { getCoreServices } from '../../utils/services-loader.js';
import type { BlueGreenStatus } from '../../types/monitor.js';

/**
 * Hook: 获取蓝绿部署状态（仅核心服务）
 */
export const useBlueGreenStatus = (
  environment: string,
  refreshInterval: number,
) => {
  const [statuses, setStatuses] = useState<BlueGreenStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ecsService = new ECSService();
    const albService = new ALBService();

    // 从 services-config.json 加载核心服务（蓝绿部署仅用于核心服务）
    const coreServices = getCoreServices();
    const services = coreServices.map((s) => s.name);

    const fetchData = async () => {
      try {
        const cluster =
          environment === 'production' ? 'optima-prod' : 'optima-stage';

        // 并发查询所有服务
        const results = await Promise.all(
          services.map(async (service) => {
            const [blue, green] = await Promise.all([
              ecsService.getServiceTasks(cluster, `optima-${service}-blue`),
              ecsService.getServiceTasks(cluster, `optima-${service}-green`),
            ]);

            // TODO: 从配置获取 listener ARN
            // 暂时返回模拟的流量分配
            const traffic = { blue: 100, green: 0 };

            return {
              service,
              blue,
              green,
              traffic,
            };
          }),
        );

        setStatuses(results);
        setError(null);
      } catch (err) {
        const error = err as Error;
        setError(error.message);
      } finally {
        setLoading(false);
      }
    };

    // 立即执行一次
    fetchData();

    // 定期刷新
    const timer = setInterval(fetchData, refreshInterval);

    return () => clearInterval(timer);
  }, [environment, refreshInterval]);

  return { statuses, loading, error };
};
