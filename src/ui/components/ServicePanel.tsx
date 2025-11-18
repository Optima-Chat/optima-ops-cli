import React, { useMemo } from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import type { ServiceHealth } from '../../types/monitor.js';
import { useTerminalSize } from '../hooks/useTerminalSize.js';

export interface ServicePanelProps {
  services: ServiceHealth[];
  loading: boolean;
  error?: string | null;
}

export const ServicePanel: React.FC<ServicePanelProps> = React.memo(({
  services,
  loading,
  error,
}) => {
  const { width } = useTerminalSize();

  // 动态计算列宽（根据可用宽度）
  const availableWidth = Math.max(width - 14, 40); // 留出边框和 padding
  const nameWidth = Math.min(Math.max(Math.floor(availableWidth * 0.5), 18), 36);
  const statusWidth = 12;
  const timeWidth = 10;

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

  if (error) {
    return (
      <Box borderStyle="round" paddingX={2} paddingY={1} borderColor="red">
        <Text color="red" bold>
          无法加载服务健康状态：{error}
        </Text>
      </Box>
    );
  }

  if (!services.length) {
    return (
      <Box borderStyle="round" paddingX={2} paddingY={1}>
        <Text dimColor>未在配置中找到任何服务</Text>
      </Box>
    );
  }

  // 分组：Core 和 MCP
  const coreServices = useMemo(
    () => services.filter((s) => s.type === 'core'),
    [services],
  );
  const mcpServices = useMemo(
    () => services.filter((s) => s.type === 'mcp'),
    [services],
  );
  const sortedCore = useMemo(() => sortServices(coreServices), [coreServices]);
  const sortedMcp = useMemo(() => sortServices(mcpServices), [mcpServices]);

  const renderService = (svc: ServiceHealth) => {
    const statusMap = {
      healthy: { icon: '●', label: '健康', color: 'green' },
      degraded: { icon: '▲', label: '降级', color: 'yellow' },
      unhealthy: { icon: '✖', label: '异常', color: 'red' },
    } as const;
    const status = statusMap[svc.health];

    const trimmedName = truncate(svc.name, nameWidth - 1);
    const responseLabel = svc.responseTime > 0 ? `${svc.responseTime}ms` : '-';

    return (
      <Box key={svc.name} flexDirection="row" alignItems="center">
        <Box width={nameWidth}>
          <Text>{trimmedName}</Text>
        </Box>
        <Box width={statusWidth}>
          <Text color={status.color}>
            {status.icon} {status.label}
          </Text>
        </Box>
        <Box width={timeWidth} justifyContent="flex-end">
          <Text dimColor>{responseLabel}</Text>
        </Box>
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
        <Box marginTop={1} flexDirection="row">
          <Box width={nameWidth}>
            <Text dimColor>服务</Text>
          </Box>
          <Box width={statusWidth}>
            <Text dimColor>状态</Text>
          </Box>
          <Box width={timeWidth}>
            <Text dimColor>响应时间</Text>
          </Box>
        </Box>
        {sortedCore.map(renderService)}
      </Box>

      {/* MCP Services */}
      <Box marginTop={1} flexDirection="column">
        <Text bold color="magenta">
          MCP 工具 ({mcpServices.length})
        </Text>
        <Box marginTop={1} flexDirection="row">
          <Box width={nameWidth}>
            <Text dimColor>服务</Text>
          </Box>
          <Box width={statusWidth}>
            <Text dimColor>状态</Text>
          </Box>
          <Box width={timeWidth}>
            <Text dimColor>响应时间</Text>
          </Box>
        </Box>
        {sortedMcp.map(renderService)}
      </Box>
    </Box>
  );
});

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  if (max <= 1) return value.charAt(0);
  return value.slice(0, max - 1) + '…';
}

function sortServices(list: ServiceHealth[]): ServiceHealth[] {
  const priority = { unhealthy: 0, degraded: 1, healthy: 2 } as const;

  return [...list].sort((a, b) => {
    const diff = priority[a.health] - priority[b.health];
    if (diff !== 0) return diff;
    return (b.responseTime || 0) - (a.responseTime || 0);
  });
}
