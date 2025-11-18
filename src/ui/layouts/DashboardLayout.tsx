import React from 'react';
import { Box } from 'ink';
import { Header } from '../components/Header.js';
import { ServicePanel } from '../components/ServicePanel.js';
import { BlueGreenPanel } from '../components/BlueGreenPanel.js';
import { DockerPanel } from '../components/DockerPanel.js';
import { KeyHints } from '../components/KeyHints.js';
import { useBlueGreenStatus } from '../hooks/useBlueGreenStatus.js';
import { useServiceMonitor } from '../hooks/useServiceMonitor.js';
import { useDockerStats } from '../hooks/useDockerStats.js';

export interface DashboardLayoutProps {
  environment: string;
  refreshInterval: number; // seconds
}

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({
  environment,
  refreshInterval,
}) => {
  // 数据 hooks（毫秒）
  const intervalMs = refreshInterval * 1000;

  const { statuses: blueGreen, loading: bgLoading } = useBlueGreenStatus(
    environment,
    intervalMs,
  );

  const { services, loading: servicesLoading } = useServiceMonitor(
    environment,
    intervalMs,
  );

  const { stats: dockerStats, loading: dockerLoading } = useDockerStats(
    environment,
    intervalMs,
  );

  return (
    <Box flexDirection="column" padding={1}>
      {/* Header */}
      <Header environment={environment} />

      {/* Services Health */}
      <Box marginTop={1}>
        <ServicePanel services={services} loading={servicesLoading} />
      </Box>

      {/* Blue/Green Deployment */}
      <Box marginTop={1}>
        <BlueGreenPanel statuses={blueGreen} loading={bgLoading} />
      </Box>

      {/* Docker Resources */}
      <Box marginTop={1}>
        <DockerPanel stats={dockerStats} loading={dockerLoading} />
      </Box>

      {/* Key Hints */}
      <Box marginTop={1}>
        <KeyHints />
      </Box>
    </Box>
  );
};
