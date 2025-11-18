import React from 'react';
import { Box, Text } from 'ink';

const shortcuts = [
  { key: 'q', label: '退出 Dashboard' },
  { key: 'Ctrl+C', label: '强制退出' },
];

export const KeyHints: React.FC = React.memo(() => {
  return (
    <Box borderStyle="single" borderColor="gray" paddingX={2} paddingY={0}>
      <Text dimColor>
        快捷键:{' '}
        {shortcuts.map((shortcut, index) => (
          <Text key={shortcut.key}>
            <Text bold>{shortcut.key}</Text>=
            {shortcut.label}
            {index < shortcuts.length - 1 ? '  ' : ''}
          </Text>
        ))}
      </Text>
    </Box>
  );
});
