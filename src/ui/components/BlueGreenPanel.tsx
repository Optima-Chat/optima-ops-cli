import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import type { BlueGreenStatus } from '../../types/monitor.js';

export interface BlueGreenPanelProps {
  statuses: BlueGreenStatus[];
  loading: boolean;
}

export const BlueGreenPanel: React.FC<BlueGreenPanelProps> = React.memo(({
  statuses,
  loading,
}) => {
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

  return (
    <Box flexDirection="column" borderStyle="round" paddingX={2} paddingY={1}>
      <Text bold color="blue">
        🔵 蓝绿部署 ({statuses.length})
      </Text>

      <Box marginTop={1}>
        <Text dimColor>
          {'服务'.padEnd(20)} {'Blue 任务'.padEnd(15)} {'Green 任务'.padEnd(15)}{' '}
          {'流量分配'.padEnd(15)}
        </Text>
      </Box>

      {statuses.map((status) => (
        <Box key={status.service} flexDirection="column">
          <Box>
            <Text>{status.service.padEnd(20)}</Text>
            <Text color="blue">
              {`${status.blue.running}/${status.blue.desired}`.padEnd(15)}
            </Text>
            <Text color="green">
              {`${status.green.running}/${status.green.desired}`.padEnd(15)}
            </Text>
            <Text>
              {`B:${status.traffic.blue}% G:${status.traffic.green}%`.padEnd(15)}
            </Text>
          </Box>
        </Box>
      ))}
    </Box>
  );
});
