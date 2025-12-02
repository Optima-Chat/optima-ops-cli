import { Command } from 'commander';
import blessed from 'neo-blessed';
import { handleError } from '../../utils/error.js';
import { PanelManager } from './panels/PanelManager.js';
import { OverviewPanel } from './panels/OverviewPanel.js';
import { ServicesPanel } from './panels/ServicesPanel.js';
import { ECSPanel } from './panels/ECSPanel.js';
import { EC2Panel } from './panels/EC2Panel.js';
import { dashboardLogger } from '../../utils/dashboard-logger.js';

/**
 * 启动多面板 Dashboard
 */
export async function startDashboard(options: { env: string; interval?: string }) {
  try {
    const environment = options.env;
    const refreshInterval = parseInt(options.interval || '5', 10) * 1000; // 转换为毫秒

      // 日志信息
      dashboardLogger.info('Multi-panel Dashboard started (Complete)', {
        environment,
        refreshInterval,
      });
      console.log(`📊 启动多面板 Dashboard... (日志: ${dashboardLogger.getLogPath()})`);

      // 创建 blessed screen
      const screen = blessed.screen({
        smartCSR: true,
        title: `Optima ${environment} Multi-Panel Monitor`,
        fullUnicode: true,
        mouse: true, // 启用鼠标支持
        style: {
          fg: '#cdd6f4',
          bg: '#1e1e2e',
        },
      });

      // 创建 PanelManager
      const panelManager = new PanelManager(screen, environment);

      // 获取缓存实例
      const cache = panelManager.getCache();

      // 注册 Panel 0: 概览
      const overviewPanel = new OverviewPanel(
        screen,
        {
          type: 'overview',
          key: '0',
          label: '概览',
          description: '系统整体健康状态',
          refreshInterval: 5000, // 5s
        },
        cache,
        environment
      );
      panelManager.registerPanel(overviewPanel);

      // 注册 Panel 1: 服务健康
      const servicesPanel = new ServicesPanel(
        screen,
        {
          type: 'services',
          key: '1',
          label: '服务健康',
          description: '所有服务详细健康状态',
          refreshInterval: 30000, // 30s
        },
        cache,
        environment
      );
      panelManager.registerPanel(servicesPanel);

      // 注册 Panel 2: ECS 服务
      const ecsPanel = new ECSPanel(
        screen,
        {
          type: 'ecs',
          key: '2',
          label: 'ECS 服务',
          description: 'ECS 服务状态和资源使用 (CloudWatch)',
          refreshInterval: 30000, // 30s
        },
        cache,
        environment
      );
      panelManager.registerPanel(ecsPanel);

      // 注册 Panel 3: EC2 资源
      const ec2Panel = new EC2Panel(
        screen,
        {
          type: 'ec2',
          key: '3',
          label: 'EC2 资源',
          description: 'EC2 实例资源使用 (CloudWatch)',
          refreshInterval: 60000, // 1min
        },
        cache,
        environment
      );
      panelManager.registerPanel(ec2Panel);

      // 初始化（显示 Overview Panel）
      panelManager.init();

      // 渲染屏幕
      screen.render();

    dashboardLogger.info('Dashboard initialized successfully (4 panels)');
  } catch (error) {
    handleError(error);
  }
}

/**
 * Multi-Panel Dashboard Command
 *
 * 多面板架构 Dashboard（无 SSH 依赖）：
 * - Panel 0: 概览 (OverviewPanel)
 * - Panel 1: 服务健康 (ServicesPanel) - HTTP 健康检查
 * - Panel 2: ECS 服务 (ECSPanel) - CloudWatch + ECS API
 * - Panel 3: EC2 资源 (EC2Panel) - CloudWatch + EC2 API
 *
 * 键盘导航：
 * - 0-3: 直接切换到指定 Panel
 * - Tab/Shift+Tab: 循环切换 Panel
 * - r: 手动刷新当前 Panel
 * - q/Esc: 退出
 */
export const dashboardCommand = new Command('dashboard')
  .description('多面板监控仪表盘（概览、服务健康、ECS 服务、EC2 资源）')
  .option('--env <environment>', '监控环境', 'production')
  .option('--interval <seconds>', '刷新间隔（秒）', '5')
  .action(startDashboard);
