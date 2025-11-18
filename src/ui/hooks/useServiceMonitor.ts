import { useState, useEffect } from 'react';
import type { ServiceHealth } from '../../types/monitor.js';
import { getAllServices } from '../../utils/services-loader.js';
import axios from 'axios';

/**
 * Hook: 监控服务健康状态
 */
export const useServiceMonitor = (
  environment: string,
  refreshInterval: number,
) => {
  const [services, setServices] = useState<ServiceHealth[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // 从 services-config.json 加载所有服务
    const allServices = getAllServices();
    const serviceEndpoints = allServices.map((svc) => ({
      name: svc.name,
      url: svc.healthEndpoint,
      type: svc.type,
    }));

    const fetchData = async () => {
      try {
        const results = await Promise.all(
          serviceEndpoints.map(async ({ name, url, type }) => {
            try {
              const startTime = Date.now();
              const response = await axios.get(url, { timeout: 5000 });
              const responseTime = Date.now() - startTime;

              return {
                name,
                type,
                health: response.status === 200 ? 'healthy' : 'degraded',
                responseTime,
                containerStatus: 'running',
              } as ServiceHealth;
            } catch (err) {
              return {
                name,
                type,
                health: 'unhealthy',
                responseTime: 0,
                containerStatus: 'unknown',
                error: (err as Error).message,
              } as ServiceHealth;
            }
          }),
        );

        setServices(results);
        setError(null);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    };

    // 立即执行
    fetchData();

    // 定期刷新
    const timer = setInterval(fetchData, refreshInterval);

    return () => clearInterval(timer);
  }, [environment, refreshInterval]);

  return { services, loading, error };
};
