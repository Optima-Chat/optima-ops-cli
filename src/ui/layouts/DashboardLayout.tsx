import React, { useEffect, useMemo, useState } from 'react';
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

  const [lastRefreshAt, setLastRefreshAt] = useState<Date | null>(null);

  // 数据 hooks（毫秒）
  const intervalMs = refreshInterval * 1000;

  const { statuses: blueGreen, loading: bgLoading, error: bgError } = useBlueGreenStatus(
    environment,
    intervalMs,
  );

  const { services, loading: servicesLoading, error: servicesError } = useServiceMonitor(
    environment,
    intervalMs,
  );

  const { stats: dockerStats, loading: dockerLoading, error: dockerError } = useDockerStats(
    environment,
    intervalMs,
  );

  // 响应式布局：大屏幕(>120)使用两列，小屏幕垂直堆叠
  const useTwoColumns = useMemo(() => width >= 120, [width]);

  // 使用 useMemo 缓存最小尺寸检查结果
  const isSizeTooSmall = useMemo(
    () => width < MIN_WIDTH || height < MIN_HEIGHT,
    [width, height],
  );

  const serviceStats = useMemo(() => {
    if (!services.length) {
      return { total: 0, healthy: 0, degraded: 0, unhealthy: 0 };
    }
    return services.reduce(
      (acc, svc) => {
        acc.total += 1;
        acc[svc.health] += 1;
        return acc;
      },
      { total: 0, healthy: 0, degraded: 0, unhealthy: 0 } as Record<
        'total' | 'healthy' | 'degraded' | 'unhealthy',
        number
      >,
    );
  }, [services]);

  useEffect(() => {
    if (servicesLoading || bgLoading || dockerLoading) {
      return;
    }
    setLastRefreshAt(new Date());
  }, [servicesLoading, bgLoading, dockerLoading, services, blueGreen, dockerStats]);

  if (isSizeTooSmall) {
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
          <Text dimColor>请调整终端窗口大小或按 q 退出</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" padding={1}>
      {/* Header - 固定高度 */}
      <Header
        environment={environment}
        refreshInterval={refreshInterval}
        serviceStats={serviceStats}
        lastUpdated={lastRefreshAt}
      />

      {useTwoColumns ? (
        // 两列布局（大屏幕）
        <Box marginTop={1} flexDirection="row">
          {/* 左列：服务健康 + 蓝绿部署 */}
          <Box width={Math.floor(width * 0.5)} marginRight={1} flexDirection="column">
            <ServicePanel
              services={services}
              loading={servicesLoading}
              error={servicesError}
            />
            <Box marginTop={1}>
              <BlueGreenPanel
                statuses={blueGreen}
                loading={bgLoading}
                error={bgError}
              />
            </Box>
          </Box>

          {/* 右列：Docker 资源 */}
          <Box flexGrow={1}>
            <DockerPanel stats={dockerStats} loading={dockerLoading} error={dockerError} />
          </Box>
        </Box>
      ) : (
        // 垂直堆叠布局（小屏幕）
        <Box marginTop={1} flexDirection="column">
          <ServicePanel
            services={services}
            loading={servicesLoading}
            error={servicesError}
          />
          <Box marginTop={1}>
            <BlueGreenPanel
              statuses={blueGreen}
              loading={bgLoading}
              error={bgError}
            />
          </Box>
          <Box marginTop={1}>
            <DockerPanel stats={dockerStats} loading={dockerLoading} error={dockerError} />
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
