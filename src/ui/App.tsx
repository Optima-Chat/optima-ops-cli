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
    // TODO: 实现其他快捷键 (d, r, t, l)
  });

  return <DashboardLayout environment={environment} refreshInterval={interval} />;
};
