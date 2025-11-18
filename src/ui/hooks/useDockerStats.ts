import { useState, useEffect } from 'react';
import type { DockerStats } from '../../types/monitor.js';
import { SSHClient } from '../../utils/ssh.js';
import { getCurrentEnvConfig } from '../../utils/config.js';

/**
 * Hook: 获取 Docker 容器资源使用
 */
export const useDockerStats = (
  environment: string,
  refreshInterval: number,
) => {
  const [stats, setStats] = useState<DockerStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const config = getCurrentEnvConfig();
        const ssh = new SSHClient({
          host: config.ec2Host,
          username: 'ec2-user',
          privateKeyPath: process.env.OPTIMA_SSH_KEY || '~/.ssh/optima-ec2-key',
        });

        await ssh.connect();

        // 获取 docker stats（不流式，一次输出）
        const result = await ssh.executeCommand(
          'docker stats --no-stream --format "{{.Container}}|{{.CPUPerc}}|{{.MemUsage}}|{{.NetIO}}"',
        );

        await ssh.disconnect();

        // 解析输出
        const lines = result.stdout.trim().split('\n');
        const parsed = lines
          .map((line) => {
            const [container, cpu, mem, net] = line.split('|');

            if (!container) return null;

            // 解析 CPU (e.g., "2.50%")
            const cpuPercent = parseFloat(cpu?.replace('%', '') || '0');

            // 解析内存 (e.g., "1.5GiB / 4GiB")
            const memParts = mem?.split(' / ') || [];
            const memoryUsed = parseMemory(memParts[0] || '0');
            const memoryTotal = parseMemory(memParts[1] || '0');

            // 解析网络 (e.g., "1.5MB / 2.3MB")
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

        // 只在数据真正变化时更新 state（避免不必要的重渲染）
        setStats((prev) => {
          if (JSON.stringify(prev) === JSON.stringify(parsed)) {
            return prev; // 数据未变化，返回旧引用
          }
          return parsed;
        });
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

  return { stats, loading, error };
};

/**
 * 辅助函数：解析内存字符串 (e.g., "1.5GiB" -> bytes)
 */
function parseMemory(str: string): number {
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
}
