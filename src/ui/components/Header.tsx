import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Box, Text } from 'ink';

export interface HeaderProps {
  environment: string;
}

export const Header: React.FC<HeaderProps> = React.memo(({ environment }) => {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    // 每分钟更新一次即可（减少不必要的重渲染）
    const updateTime = () => {
      setTime(new Date());
    };

    updateTime(); // 立即更新一次

    // 计算到下一分钟的剩余秒数
    const now = new Date();
    const secondsToNextMinute = 60 - now.getSeconds();
    const msToNextMinute = secondsToNextMinute * 1000 - now.getMilliseconds();

    let intervalTimer: NodeJS.Timeout | null = null;

    // 先等到下一分钟
    const initialTimeout = setTimeout(() => {
      updateTime();
      // 然后每分钟更新
      intervalTimer = setInterval(updateTime, 60000);
    }, msToNextMinute);

    return () => {
      clearTimeout(initialTimeout);
      if (intervalTimer) clearInterval(intervalTimer);
    };
  }, []);

  // 缓存格式化函数（不显示秒）
  const formatTime = useCallback((date: Date) => {
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  }, []);

  // 缓存格式化后的时间字符串
  const formattedTime = useMemo(() => formatTime(time), [time, formatTime]);

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
      <Text dimColor>{formattedTime}</Text>
    </Box>
  );
});
