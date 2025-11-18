import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import type { ServiceHealth } from '../../types/monitor.js';
import { useTerminalSize } from '../hooks/useTerminalSize.js';

export interface ServicePanelProps {
  services: ServiceHealth[];
  loading: boolean;
}

export const ServicePanel: React.FC<ServicePanelProps> = React.memo(({
  services,
  loading,
}) => {
  const { width } = useTerminalSize();

  // 动态计算列宽（根据可用宽度）
  const availableWidth = Math.max(width - 10, 40); // 减去边框和 padding
  const nameWidth = Math.min(Math.max(Math.floor(availableWidth * 0.6), 18), 30);
  const statusWidth = 3;
  const timeWidth = 8;

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

    // 截断服务名（如果过长）
    const displayName =
      svc.name.length > nameWidth
        ? svc.name.substring(0, nameWidth - 1) + '…'
        : svc.name.padEnd(nameWidth);

    const displayTime =
      svc.responseTime > 0
        ? (svc.responseTime + 'ms').padEnd(timeWidth)
        : '-'.padEnd(timeWidth);

    return (
      <Box key={svc.name}>
        <Text>{displayName}</Text>
        <Text color={statusColor}>{statusIcon.padEnd(statusWidth)}</Text>
        <Text dimColor>{displayTime}</Text>
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
            {'服务'.padEnd(nameWidth)} {'状态'.padEnd(statusWidth)}{' '}
            {'响应时间'.padEnd(timeWidth)}
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
            {'服务'.padEnd(nameWidth)} {'状态'.padEnd(statusWidth)}{' '}
            {'响应时间'.padEnd(timeWidth)}
          </Text>
        </Box>
        {mcpServices.map(renderService)}
      </Box>
    </Box>
  );
});
