import { useState, useEffect } from 'react';
import type { ServiceHealth } from '../../types/monitor.js';
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
    // 服务健康端点（从 services-config.json 获取更好）
    const serviceEndpoints = [
      { name: 'user-auth', url: 'https://auth.optima.shop/health' },
      { name: 'mcp-host', url: 'https://mcp.optima.shop/health' },
      { name: 'commerce-backend', url: 'https://api.optima.shop/health' },
      { name: 'agentic-chat', url: 'https://ai.optima.shop/health' },
    ];

    const fetchData = async () => {
      try {
        const results = await Promise.all(
          serviceEndpoints.map(async ({ name, url }) => {
            try {
              const startTime = Date.now();
              const response = await axios.get(url, { timeout: 5000 });
              const responseTime = Date.now() - startTime;

              return {
                name,
                health: response.status === 200 ? 'healthy' : 'degraded',
                responseTime,
                containerStatus: 'running',
              } as ServiceHealth;
            } catch (err) {
              return {
                name,
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
