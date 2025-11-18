import React, { useMemo } from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import type { DockerStats } from '../../types/monitor.js';
import { useTerminalSize } from '../hooks/useTerminalSize.js';

export interface DockerPanelProps {
  stats: DockerStats[];
  loading: boolean;
  error?: string | null;
}

export const DockerPanel: React.FC<DockerPanelProps> = React.memo(({ stats, loading, error }) => {
  const { width } = useTerminalSize();
  const availableWidth = Math.max(width - 14, 60);
  const nameWidth = Math.min(Math.max(Math.floor(availableWidth * 0.35), 24), 40);
  const cpuWidth = 10;
  const memoryWidth = 18;
  const networkWidth = Math.max(availableWidth - nameWidth - cpuWidth - memoryWidth - 2, 18);

  if (loading) {
    return (
      <Box borderStyle="round" paddingX={2} paddingY={1}>
        <Text color="cyan">
          <Spinner type="dots" />
        </Text>
        <Text> 加载 Docker 资源...</Text>
      </Box>
    );
  }

  if (error) {
    return (
      <Box borderStyle="round" paddingX={2} paddingY={1} borderColor="red">
        <Text color="red" bold>
          无法获取 Docker 资源：{error}
        </Text>
      </Box>
    );
  }

  if (!stats.length) {
    return (
      <Box borderStyle="round" paddingX={2} paddingY={1}>
        <Text dimColor>未收集到任何容器的资源数据</Text>
      </Box>
    );
  }

  const sortedStats = useMemo(() => {
    return [...stats].sort((a, b) => {
      if (b.cpuPercent !== a.cpuPercent) {
        return b.cpuPercent - a.cpuPercent;
      }
      const aMemRatio =
        a.memoryTotal === 0 ? 0 : Math.min(a.memoryUsed / a.memoryTotal, 1);
      const bMemRatio =
        b.memoryTotal === 0 ? 0 : Math.min(b.memoryUsed / b.memoryTotal, 1);
      return bMemRatio - aMemRatio;
    });
  }, [stats]);

  return (
    <Box flexDirection="column" borderStyle="round" paddingX={2} paddingY={1}>
      <Text bold color="magenta">
        🐳 Docker 资源 ({stats.length})
      </Text>

      <Box marginTop={1} flexDirection="row">
        <Box width={nameWidth}>
          <Text dimColor>容器</Text>
        </Box>
        <Box width={cpuWidth}>
          <Text dimColor>CPU</Text>
        </Box>
        <Box width={memoryWidth}>
          <Text dimColor>内存 (已用/总)</Text>
        </Box>
        <Box width={networkWidth}>
          <Text dimColor>网络 Rx/Tx</Text>
        </Box>
      </Box>

      {sortedStats.map((stat) => {
        const memPercent = (stat.memoryUsed / stat.memoryTotal) * 100;
        const cpuHigh = stat.cpuPercent > 80;
        const memHigh = memPercent > 80;
        const memStr = formatBytes(stat.memoryUsed) + '/' + formatBytes(stat.memoryTotal);
        const netStr = formatBytes(stat.networkRx) + '/' + formatBytes(stat.networkTx);

        return (
          <Box key={stat.container} flexDirection="row">
            <Box width={nameWidth}>
              <Text>{truncate(stat.container, nameWidth - 1)}</Text>
            </Box>
            <Box width={cpuWidth}>
              <Text color={cpuHigh ? 'red' : undefined}>{stat.cpuPercent.toFixed(1)}%</Text>
            </Box>
            <Box width={memoryWidth}>
              <Text color={memHigh ? 'red' : undefined}>{memStr}</Text>
            </Box>
            <Box width={networkWidth}>
              <Text dimColor>{netStr}</Text>
            </Box>
          </Box>
        );
      })}
    </Box>
  );
});

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const value = bytes / Math.pow(k, i);
  return value.toFixed(2) + ' ' + sizes[i];
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  if (max <= 1) return value.charAt(0);
  return value.slice(0, max - 1) + '…';
}
