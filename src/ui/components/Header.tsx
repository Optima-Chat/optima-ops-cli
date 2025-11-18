import React, { useMemo } from 'react';
import { Box, Text } from 'ink';

interface ServiceStatsSummary {
  total: number;
  healthy: number;
  degraded: number;
  unhealthy: number;
}

export interface HeaderProps {
  environment: string;
  refreshInterval?: number; // 显示刷新间隔而不是时间
  serviceStats?: ServiceStatsSummary;
  lastUpdated?: Date | null;
}

export const Header: React.FC<HeaderProps> = React.memo(
  ({ environment, refreshInterval = 5, serviceStats, lastUpdated }) => {
    // 缓存环境名称
    const capitalizedEnv = useMemo(
      () => environment.charAt(0).toUpperCase() + environment.slice(1),
      [environment],
    );

    const stats = serviceStats ?? { total: 0, healthy: 0, degraded: 0, unhealthy: 0 };
    const updatedLabel = useMemo(() => {
      if (!lastUpdated) {
        return '同步中...';
      }
      return `${lastUpdated.toLocaleTimeString()} (${capitalizeRelativeTime(lastUpdated)})`;
    }, [lastUpdated]);

    return (
      <Box
        borderStyle="round"
        borderColor="cyan"
        paddingX={2}
        paddingY={1}
        alignItems="center"
      >
        <Text bold color="cyan">
          ⚡ Optima {capitalizedEnv} Monitor
        </Text>
        <Box marginLeft={2}>
          <Text color="green">● {stats.healthy}</Text>
          <Text> </Text>
          <Text color="yellow">● {stats.degraded}</Text>
          <Text> </Text>
          <Text color="red">● {stats.unhealthy}</Text>
        </Box>
        <Box flexGrow={1} />
        <Box flexDirection="column" alignItems="flex-end">
          <Text dimColor>服务总数: {stats.total}</Text>
          <Text dimColor>上次刷新: {updatedLabel}</Text>
          <Text dimColor>刷新间隔: {refreshInterval}s</Text>
        </Box>
      </Box>
    );
  },
);

function capitalizeRelativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  if (diffMs < 0) {
    return '刚刚';
  }
  const diffSeconds = Math.floor(diffMs / 1000);
  if (diffSeconds < 5) return '刚刚';
  if (diffSeconds < 60) return `${diffSeconds}s 前`;
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}m 前`;
  const diffHours = Math.floor(diffMinutes / 60);
  return `${diffHours}h 前`;
}
