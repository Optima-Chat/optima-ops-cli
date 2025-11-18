import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';

export interface HeaderProps {
  environment: string;
}

export const Header: React.FC<HeaderProps> = ({ environment }) => {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (date: Date) => {
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  };

  return (
    <Box borderStyle="round" borderColor="cyan" paddingX={2} paddingY={1}>
      <Text bold color="cyan">
        ⚡ Optima {environment.charAt(0).toUpperCase() + environment.slice(1)}{' '}
        Monitor
      </Text>
      <Box flexGrow={1} />
      <Text dimColor>{formatTime(time)}</Text>
    </Box>
  );
};
