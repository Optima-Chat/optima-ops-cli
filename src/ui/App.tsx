import React from 'react';
import { Box, Text, useApp, useInput } from 'ink';

export interface AppProps {
  environment: string;
  interval: number;
}

export const App: React.FC<AppProps> = ({ environment, interval }) => {
  const { exit } = useApp();

  useInput((input) => {
    if (input === 'q') {
      exit();
    }
  });

  return (
    <Box flexDirection="column" padding={1}>
      <Box borderStyle="round" borderColor="cyan" padding={1}>
        <Text bold color="cyan">
          Optima {environment.toUpperCase()} Monitor
        </Text>
      </Box>

      <Box marginTop={1} padding={1}>
        <Text>
          刷新间隔: <Text bold>{interval}秒</Text>
        </Text>
      </Box>

      <Box marginTop={1} padding={1}>
        <Text dimColor>
          按 <Text bold>q</Text> 退出
        </Text>
      </Box>
    </Box>
  );
};
