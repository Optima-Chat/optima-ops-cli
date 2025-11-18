import { useState, useEffect } from 'react';

export interface TerminalSize {
  width: number;
  height: number;
}

/**
 * Hook: 获取终端尺寸并监听变化
 */
export const useTerminalSize = (): TerminalSize => {
  const [size, setSize] = useState<TerminalSize>({
    width: process.stdout.columns || 80,
    height: process.stdout.rows || 24,
  });

  useEffect(() => {
    const handleResize = () => {
      setSize({
        width: process.stdout.columns || 80,
        height: process.stdout.rows || 24,
      });
    };

    process.stdout.on('resize', handleResize);
    return () => {
      process.stdout.off('resize', handleResize);
    };
  }, []);

  return size;
};
