import React from 'react';
import { useApp, useInput } from 'ink';
import { DashboardLayout } from './layouts/DashboardLayout.js';

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
    // TODO: 在实现新的快捷键时同步更新 KeyHints
  });

  return <DashboardLayout environment={environment} refreshInterval={interval} />;
};
