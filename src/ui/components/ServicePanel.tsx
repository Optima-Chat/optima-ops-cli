import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import type { ServiceHealth } from '../../types/monitor.js';

export interface ServicePanelProps {
  services: ServiceHealth[];
  loading: boolean;
}

export const ServicePanel: React.FC<ServicePanelProps> = ({
  services,
  loading,
}) => {
  if (loading) {
    return (
      <Box borderStyle="round" paddingX={2} paddingY={1}>
        <Text color="cyan">
          <Spinner type="dots" />
        </Text>
        <Text> 加载服务状态...</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" borderStyle="round" paddingX={2} paddingY={1}>
      <Text bold color="yellow">
        🏥 服务健康 ({services.length})
      </Text>

      <Box marginTop={1}>
        <Text dimColor>
          {'服务名称'.padEnd(20)} {'状态'.padEnd(10)} {'响应时间'.padEnd(12)}{' '}
          {'容器'.padEnd(12)}
        </Text>
      </Box>

      {services.map((svc) => (
        <Box key={svc.name}>
          <Text>{svc.name.padEnd(20)}</Text>
          <Text
            color={
              svc.health === 'healthy'
                ? 'green'
                : svc.health === 'degraded'
                  ? 'yellow'
                  : 'red'
            }
          >
            {(svc.health === 'healthy'
              ? '✓ 正常'
              : svc.health === 'degraded'
                ? '⚠ 降级'
                : '✗ 异常'
            ).padEnd(10)}
          </Text>
          <Text>{`${svc.responseTime}ms`.padEnd(12)}</Text>
          <Text dimColor>{svc.containerStatus.padEnd(12)}</Text>
        </Box>
      ))}
    </Box>
  );
};
