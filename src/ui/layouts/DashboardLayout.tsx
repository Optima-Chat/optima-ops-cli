import React from 'react';
import { Box, Text } from 'ink';
import { Header } from '../components/Header.js';
import { ServicePanel } from '../components/ServicePanel.js';
import { BlueGreenPanel } from '../components/BlueGreenPanel.js';
import { DockerPanel } from '../components/DockerPanel.js';
import { KeyHints } from '../components/KeyHints.js';
import { useBlueGreenStatus } from '../hooks/useBlueGreenStatus.js';
import { useServiceMonitor } from '../hooks/useServiceMonitor.js';
import { useDockerStats } from '../hooks/useDockerStats.js';
import { useTerminalSize } from '../hooks/useTerminalSize.js';

export interface DashboardLayoutProps {
  environment: string;
  refreshInterval: number; // seconds
}

const MIN_WIDTH = 80;
const MIN_HEIGHT = 24;

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({
  environment,
  refreshInterval,
}) => {
  // 终端尺寸检测
  const { width, height } = useTerminalSize();

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

  // 检查最小尺寸
  if (width < MIN_WIDTH || height < MIN_HEIGHT) {
    return (
      <Box flexDirection="column" padding={1}>
        <Box borderStyle="round" borderColor="red" paddingX={2} paddingY={1}>
          <Text color="red" bold>
            ⚠️ 终端尺寸过小
          </Text>
        </Box>
        <Box marginTop={1} paddingX={2}>
          <Text>
            当前尺寸: {width} x {height}
          </Text>
          <Text>
            最小要求: {MIN_WIDTH} x {MIN_HEIGHT}
          </Text>
          <Text dimColor>
            请调整终端窗口大小或按 q 退出
          </Text>
        </Box>
      </Box>
    );
  }

  // 响应式布局：大屏幕(>120)使用两列，小屏幕垂直堆叠
  const useTwoColumns = width >= 120;

  return (
    <Box flexDirection="column" padding={1}>
      {/* Header - 固定高度 */}
      <Header environment={environment} />

      {useTwoColumns ? (
        // 两列布局（大屏幕）
        <Box marginTop={1} flexDirection="row">
          {/* 左列：服务健康 + 蓝绿部署 */}
          <Box width={Math.floor(width * 0.5)} marginRight={1} flexDirection="column">
            <ServicePanel services={services} loading={servicesLoading} />
            <Box marginTop={1}>
              <BlueGreenPanel statuses={blueGreen} loading={bgLoading} />
            </Box>
          </Box>

          {/* 右列：Docker 资源 */}
          <Box flexGrow={1}>
            <DockerPanel stats={dockerStats} loading={dockerLoading} />
          </Box>
        </Box>
      ) : (
        // 垂直堆叠布局（小屏幕）
        <Box marginTop={1} flexDirection="column">
          <ServicePanel services={services} loading={servicesLoading} />
          <Box marginTop={1}>
            <BlueGreenPanel statuses={blueGreen} loading={bgLoading} />
          </Box>
          <Box marginTop={1}>
            <DockerPanel stats={dockerStats} loading={dockerLoading} />
          </Box>
        </Box>
      )}

      {/* Key Hints - 固定在底部 */}
      <Box marginTop={1}>
        <KeyHints />
      </Box>
    </Box>
  );
};
