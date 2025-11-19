import { Command } from 'commander';
import blessed from 'neo-blessed';
import { handleError } from '../../utils/error.js';
import { PanelManager } from './panels/PanelManager.js';
import { OverviewPanel } from './panels/OverviewPanel.js';
import { BlueGreenPanel } from './panels/BlueGreenPanel.js';
import { dashboardLogger } from '../../utils/dashboard-logger.js';

/**
 * Multi-Panel Dashboard Command (MVP)
 *
 * 新一代多面板架构 Dashboard：
 * - Panel 0: 概览 (OverviewPanel)
 * - Panel 4: 蓝绿部署 (BlueGreenPanel)
 *
 * 键盘导航：
 * - 0/4: 直接切换到指定 Panel
 * - Tab/Shift+Tab: 循环切换 Panel
 * - r: 手动刷新当前 Panel
 * - q/Esc: 退出
 *
 * Phase 2 MVP 实现
 */
export const dashboardCommand = new Command('dashboard')
  .description('多面板监控仪表盘（MVP：概览 + 蓝绿部署）')
  .option('--env <environment>', '监控环境', 'production')
  .option('--interval <seconds>', '刷新间隔（秒）', '5')
  .action(async (options) => {
    try {
      const environment = options.env;
      const refreshInterval = parseInt(options.interval, 10) * 1000; // 转换为毫秒

      // 日志信息
      dashboardLogger.info('Multi-panel Dashboard started (MVP)', {
        environment,
        refreshInterval,
      });
      console.log(`📊 启动多面板 Dashboard... (日志: ${dashboardLogger.getLogPath()})`);

      // 创建 blessed screen
      const screen = blessed.screen({
        smartCSR: true,
        title: `Optima ${environment} Multi-Panel Monitor`,
        fullUnicode: true,
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

      // 注册 Panel 4: 蓝绿部署
      const blueGreenPanel = new BlueGreenPanel(
        screen,
        {
          type: 'bluegreen',
          key: '4',
          label: '蓝绿部署',
          description: '蓝绿部署状态和流量分配',
          refreshInterval: 5000, // 5s
        },
        cache,
        environment
      );
      panelManager.registerPanel(blueGreenPanel);

      // 初始化（显示 Overview Panel）
      panelManager.init();

      // 渲染屏幕
      screen.render();

      dashboardLogger.info('Dashboard initialized successfully');
    } catch (error) {
      handleError(error);
    }
  });
