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

  // 分组：Core 和 MCP
  const coreServices = services.filter((s) => s.type === 'core');
  const mcpServices = services.filter((s) => s.type === 'mcp');

  const renderService = (svc: ServiceHealth) => {
    const statusIcon =
      svc.health === 'healthy'
        ? '✓'
        : svc.health === 'degraded'
          ? '⚠'
          : '✗';
    const statusColor =
      svc.health === 'healthy'
        ? 'green'
        : svc.health === 'degraded'
          ? 'yellow'
          : 'red';

    return (
      <Box key={svc.name}>
        <Text>{svc.name.padEnd(22)}</Text>
        <Text color={statusColor}>{statusIcon.padEnd(3)}</Text>
        <Text dimColor>{svc.responseTime > 0 ? svc.responseTime + 'ms' : '-'.padEnd(6)}</Text>
      </Box>
    );
  };

  return (
    <Box flexDirection="column" borderStyle="round" paddingX={2} paddingY={1}>
      <Text bold color="yellow">
        🏥 服务健康 ({services.length})
      </Text>

      {/* Core Services */}
      <Box marginTop={1} flexDirection="column">
        <Text bold color="cyan">
          核心服务 ({coreServices.length})
        </Text>
        <Box marginTop={1}>
          <Text dimColor>
            {'服务'.padEnd(22)} {'状态'.padEnd(3)} {'响应时间'}
          </Text>
        </Box>
        {coreServices.map(renderService)}
      </Box>

      {/* MCP Services */}
      <Box marginTop={1} flexDirection="column">
        <Text bold color="magenta">
          MCP 工具 ({mcpServices.length})
        </Text>
        <Box marginTop={1}>
          <Text dimColor>
            {'服务'.padEnd(22)} {'状态'.padEnd(3)} {'响应时间'}
          </Text>
        </Box>
        {mcpServices.map(renderService)}
      </Box>
    </Box>
  );
};
