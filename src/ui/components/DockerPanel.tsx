import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import type { DockerStats } from '../../types/monitor.js';

export interface DockerPanelProps {
  stats: DockerStats[];
  loading: boolean;
}

export const DockerPanel: React.FC<DockerPanelProps> = React.memo(({ stats, loading }) => {
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

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    const value = bytes / Math.pow(k, i);
    return value.toFixed(2) + ' ' + sizes[i];
  };

  return (
    <Box flexDirection="column" borderStyle="round" paddingX={2} paddingY={1}>
      <Text bold color="magenta">
        🐳 Docker 资源 ({stats.length})
      </Text>

      <Box marginTop={1}>
        <Text dimColor>
          {'容器'.padEnd(30)} {'CPU'.padEnd(10)} {'内存'.padEnd(20)}{' '}
          {'网络 Rx/Tx'.padEnd(25)}
        </Text>
      </Box>

      {stats.map((stat) => {
        const memPercent = (stat.memoryUsed / stat.memoryTotal) * 100;
        const cpuHigh = stat.cpuPercent > 80;
        const memHigh = memPercent > 80;
        const memStr = formatBytes(stat.memoryUsed) + '/' + formatBytes(stat.memoryTotal);
        const netStr = formatBytes(stat.networkRx) + '/' + formatBytes(stat.networkTx);

        return (
          <Box key={stat.container}>
            <Text>{stat.container.substring(0, 28).padEnd(30)}</Text>
            <Text color={cpuHigh ? 'red' : undefined}>
              {stat.cpuPercent.toFixed(1) + '%'.padEnd(10)}
            </Text>
            <Text color={memHigh ? 'red' : undefined}>
              {memStr.padEnd(20)}
            </Text>
            <Text dimColor>
              {netStr.padEnd(25)}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
});
