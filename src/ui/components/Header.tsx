import React, { useMemo } from 'react';
import { Box, Text } from 'ink';

export interface HeaderProps {
  environment: string;
  refreshInterval?: number; // 显示刷新间隔而不是时间
}

export const Header: React.FC<HeaderProps> = React.memo(
  ({ environment, refreshInterval = 5 }) => {
    // 缓存环境名称
    const capitalizedEnv = useMemo(
      () => environment.charAt(0).toUpperCase() + environment.slice(1),
      [environment],
    );

    return (
      <Box borderStyle="round" borderColor="cyan" paddingX={2} paddingY={1}>
        <Text bold color="cyan">
          ⚡ Optima {capitalizedEnv} Monitor
        </Text>
        <Box flexGrow={1} />
        <Text dimColor>刷新间隔: {refreshInterval}s</Text>
      </Box>
    );
  },
);
