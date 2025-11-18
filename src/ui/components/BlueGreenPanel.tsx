import React, { useMemo } from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import type { BlueGreenStatus } from '../../types/monitor.js';
import { useTerminalSize } from '../hooks/useTerminalSize.js';

export interface BlueGreenPanelProps {
  statuses: BlueGreenStatus[];
  loading: boolean;
  error?: string | null;
}

export const BlueGreenPanel: React.FC<BlueGreenPanelProps> = React.memo(({
  statuses,
  loading,
  error,
}) => {
  const { width } = useTerminalSize();
  const availableWidth = Math.max(width - 14, 50);
  const serviceWidth = Math.min(Math.max(Math.floor(availableWidth * 0.35), 18), 32);
  const targetWidth = 14;
  const trafficWidth = Math.max(availableWidth - serviceWidth - targetWidth * 2 - 2, 12);
  const sortedStatuses = useMemo(() => sortStatuses(statuses), [statuses]);

  if (loading) {
    return (
      <Box borderStyle="round" paddingX={2} paddingY={1}>
        <Text color="cyan">
          <Spinner type="dots" />
        </Text>
        <Text> 加载蓝绿部署状态...</Text>
      </Box>
    );
  }

  if (error) {
    return (
      <Box borderStyle="round" paddingX={2} paddingY={1} borderColor="red">
        <Text color="red" bold>
          无法获取蓝绿部署：{error}
        </Text>
      </Box>
    );
  }

  if (!statuses.length) {
    return (
      <Box borderStyle="round" paddingX={2} paddingY={1}>
        <Text dimColor>暂无配置的蓝绿部署服务</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" borderStyle="round" paddingX={2} paddingY={1}>
      <Text bold color="blue">
        🔵 蓝绿部署 ({statuses.length})
      </Text>

      <Box marginTop={1} flexDirection="row">
        <Box width={serviceWidth}>
          <Text dimColor>服务</Text>
        </Box>
        <Box width={targetWidth}>
          <Text dimColor>Blue 任务</Text>
        </Box>
        <Box width={targetWidth}>
          <Text dimColor>Green 任务</Text>
        </Box>
        <Box width={trafficWidth}>
          <Text dimColor>流量分配</Text>
        </Box>
      </Box>

      {sortedStatuses.map((status) => (
        <Box key={status.service} flexDirection="row">
          <Box width={serviceWidth}>
            <Text>{truncate(status.service, serviceWidth - 1)}</Text>
          </Box>
          <Box width={targetWidth}>
            <Text color={status.blue.running < status.blue.desired ? 'yellow' : 'blue'}>
              {status.blue.running}/{status.blue.desired}
            </Text>
          </Box>
          <Box width={targetWidth}>
            <Text color={status.green.running < status.green.desired ? 'yellow' : 'green'}>
              {status.green.running}/{status.green.desired}
            </Text>
          </Box>
          <Box width={trafficWidth}>
            <Text>
              <Text color="blue">B:{status.traffic.blue}% </Text>
              <Text color="green">G:{status.traffic.green}%</Text>
            </Text>
          </Box>
        </Box>
      ))}
    </Box>
  );
});

function sortStatuses(list: BlueGreenStatus[]): BlueGreenStatus[] {
  return [...list].sort((a, b) => b.traffic.green - a.traffic.green);
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  if (max <= 1) return value.charAt(0);
  return value.slice(0, max - 1) + '…';
}
