import React from 'react';
import { Box, Text } from 'ink';

export const KeyHints: React.FC = React.memo(() => {
  return (
    <Box borderStyle="single" borderColor="gray" paddingX={2} paddingY={0}>
      <Text dimColor>
        快捷键: <Text bold>q</Text>=退出 <Text bold>d</Text>=部署{' '}
        <Text bold>r</Text>=回滚 <Text bold>t</Text>=调整流量{' '}
        <Text bold>l</Text>=日志
      </Text>
    </Box>
  );
});
