import blessed from 'neo-blessed';
import type { PanelType, PanelConfig } from '../../../types/monitor.js';
import { DataCache } from '../../../services/monitor/DataCache.js';
import { MonitorDataService } from '../../../services/monitor/MonitorDataService.js';
import { BlueGreenService } from '../../../services/monitor/BlueGreenService.js';
import type { BasePanel } from './BasePanel.js';

/**
 * Panel 管理器
 *
 * 负责：
 * - 管理所有 Panel 的生命周期
 * - 处理 Panel 切换逻辑
 * - 管理键盘导航
 * - 协调数据缓存
 * - **统一后台数据刷新**（新增）
 */
export class PanelManager {
  private screen: blessed.Widgets.Screen;
  private panels: Map<PanelType, BasePanel>;
  private currentPanel: PanelType;
  private cache: DataCache;
  private headerBox: blessed.Widgets.BoxElement;
  private footerBox: blessed.Widgets.BoxElement;
  private environment: string;

  // 统一数据刷新
  private dataService: MonitorDataService;
  private blueGreenService: BlueGreenService;
  private refreshTimers: Map<string, NodeJS.Timeout>;

  // Panel 配置
  private static readonly PANEL_CONFIGS: PanelConfig[] = [
    {
      type: 'overview',
      key: '0',
      label: '概览',
      description: '系统整体健康状态',
      refreshInterval: 5000, // 5s
    },
    {
      type: 'services',
      key: '1',
      label: '服务健康',
      description: '所有服务详细健康状态',
      refreshInterval: 30000, // 30s
    },
    {
      type: 'ec2',
      key: '2',
      label: 'EC2 资源',
      description: 'EC2 实例资源使用',
      refreshInterval: 300000, // 5min
    },
    {
      type: 'docker',
      key: '3',
      label: 'Docker 容器',
      description: 'Docker 容器资源使用',
      refreshInterval: 30000, // 30s
    },
    {
      type: 'bluegreen',
      key: '4',
      label: '蓝绿部署',
      description: '蓝绿部署状态和流量分配',
      refreshInterval: 5000, // 5s
    },
  ];

  constructor(screen: blessed.Widgets.Screen, environment: string) {
    this.screen = screen;
    this.environment = environment;
    this.panels = new Map();
    this.currentPanel = 'overview';
    this.cache = new DataCache();

    // 初始化数据服务
    this.dataService = new MonitorDataService(environment);
    this.blueGreenService = new BlueGreenService(environment);
    this.refreshTimers = new Map();

    // 创建 Header 和 Footer
    this.headerBox = this.createHeader();
    this.footerBox = this.createFooter();

    // 绑定键盘事件
    this.bindKeys();
  }

  /**
   * 创建 Header（显示标题 + 系统摘要 + 时间）
   */
  private createHeader(): blessed.Widgets.BoxElement {
    const envCapitalized = this.environment.charAt(0).toUpperCase() + this.environment.slice(1);

    const container = blessed.box({
      parent: this.screen,
      top: 0,
      left: 0,
      width: '100%',
      height: 3,
      border: {
        type: 'line',
      },
      style: {
        fg: '#cdd6f4',
        bg: '#1e1e2e',
        border: {
          fg: '#89b4fa',
        },
      },
    });

    // 左侧标题
    blessed.text({
      parent: container,
      top: 0,
      left: 1,
      content: `{bold}Optima ${envCapitalized} Monitor{/bold}`,
      tags: true,
      style: {
        fg: '#cba6f7',
      },
    });

    // 中间摘要信息（动态更新）
    const summaryBox = blessed.text({
      parent: container,
      top: 0,
      left: 'center',
      content: '',
      tags: true,
      style: {
        fg: '#a6adc8',
      },
    });

    // 右侧时间
    const timeBox = blessed.text({
      parent: container,
      top: 0,
      right: 1,
      content: '',
      style: {
        fg: '#a6adc8',
      },
    });

    // 更新时间和摘要
    const updateHeader = () => {
      // 时间
      const now = new Date();
      const timeStr = now.toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      });
      timeBox.setContent(timeStr);

      // 摘要信息（从缓存读取）
      const services = this.cache.getServices(this.environment);
      const ec2 = this.cache.getEC2(this.environment);
      const docker = this.cache.getDocker(this.environment);

      let summary = '';
      if (services && services.length > 0) {
        const healthy = services.filter((s) => s.prod.health === 'healthy').length;
        const total = services.length;
        const color = healthy === total ? 'green' : healthy > total / 2 ? 'yellow' : 'red';
        summary += `{${color}-fg}${healthy}/${total} 服务{/${color}-fg}`;
      }

      if (ec2 && ec2.length > 0) {
        const online = ec2.filter((e) => !e.offline).length;
        const total = ec2.length;
        summary += ` | {cyan-fg}${online}/${total} EC2{/cyan-fg}`;
      }

      if (docker && docker.length > 0) {
        const totalContainers = docker.reduce((sum, d) => sum + (d.stats?.length || 0), 0);
        summary += ` | {blue-fg}${totalContainers} 容器{/blue-fg}`;
      }

      summaryBox.setContent(summary);
      this.screen.render();
    };

    updateHeader();
    setInterval(updateHeader, 2000); // 2秒更新一次摘要

    return container;
  }

  /**
   * 创建 Footer（快捷键提示）
   */
  private createFooter(): blessed.Widgets.BoxElement {
    return blessed.box({
      parent: this.screen,
      bottom: 0,
      left: 0,
      width: '100%',
      height: 3,
      content: ' {bold}面板{/bold}: [0-4]=跳转 [Tab/←→/hl]=切换 | {bold}滚动{/bold}: [↑↓/jk]=逐行 [PgUp/PgDn]=快速 [鼠标滚轮] | {bold}操作{/bold}: [r]=刷新 [q]=退出',
      tags: true,
      border: {
        type: 'single',
      },
      style: {
        fg: '#a6adc8',
        bg: '#1e1e2e',
        border: {
          fg: '#313244',
        },
      },
    });
  }

  /**
   * 绑定键盘事件
   */
  private bindKeys(): void {
    // 退出
    this.screen.key(['escape', 'q', 'C-c'], () => {
      this.destroy();
      process.exit(0);
    });

    // 直接切换到指定 Panel（0-4）
    for (const config of PanelManager.PANEL_CONFIGS) {
      this.screen.key([config.key], () => {
        this.switchPanel(config.type);
      });
    }

    // Tab: 下一个 Panel
    this.screen.key(['tab'], () => {
      this.switchToNext();
    });

    // Shift+Tab: 上一个 Panel
    this.screen.key(['S-tab'], () => {
      this.switchToPrevious();
    });

    // r: 手动刷新当前 Panel
    this.screen.key(['r'], () => {
      this.refreshCurrentPanel();
    });

    // 左右箭头：面板导航（在 screen 级别捕获，优先级高于 container）
    this.screen.key(['left'], () => {
      this.switchToPrevious();
    });

    this.screen.key(['right'], () => {
      this.switchToNext();
    });

    // H/L（大写）：面板导航
    this.screen.key(['S-h', 'h'], () => {
      this.switchToPrevious();
    });

    this.screen.key(['S-l', 'l'], () => {
      this.switchToNext();
    });
  }

  /**
   * 注册 Panel
   */
  registerPanel(panel: BasePanel): void {
    this.panels.set(panel.getType(), panel);
  }

  /**
   * 切换到指定 Panel
   */
  switchPanel(type: PanelType): void {
    const panel = this.panels.get(type);
    if (!panel) {
      return;
    }

    // 隐藏当前 Panel
    const currentPanelInstance = this.panels.get(this.currentPanel);
    if (currentPanelInstance) {
      currentPanelInstance.hide();
    }

    // 显示新 Panel
    this.currentPanel = type;
    panel.show();

    // 设置焦点到新面板的容器（使其能接收键盘事件）
    const container = (panel as any).container;
    if (container && container.focus) {
      container.focus();
    }

    // OverviewPanel 特殊处理（设置焦点到 leftBox）
    if (type === 'overview') {
      const leftBox = (panel as any).leftBox;
      if (leftBox && leftBox.focus) {
        leftBox.focus();
      }
    }

    // 更新 Footer 提示
    this.updateFooter();
  }

  /**
   * 切换到下一个 Panel
   */
  private switchToNext(): void {
    const configs = PanelManager.PANEL_CONFIGS;
    const currentIndex = configs.findIndex((c) => c.type === this.currentPanel);
    const nextIndex = (currentIndex + 1) % configs.length;
    const nextConfig = configs[nextIndex];
    if (nextConfig) {
      this.switchPanel(nextConfig.type);
    }
  }

  /**
   * 切换到上一个 Panel
   */
  private switchToPrevious(): void {
    const configs = PanelManager.PANEL_CONFIGS;
    const currentIndex = configs.findIndex((c) => c.type === this.currentPanel);
    const prevIndex = (currentIndex - 1 + configs.length) % configs.length;
    const prevConfig = configs[prevIndex];
    if (prevConfig) {
      this.switchPanel(prevConfig.type);
    }
  }

  /**
   * 刷新当前 Panel
   */
  private async refreshCurrentPanel(): Promise<void> {
    const panel = this.panels.get(this.currentPanel);
    if (panel) {
      await panel.refresh();
    }
  }

  /**
   * 更新 Footer 提示
   */
  private updateFooter(): void {
    const currentConfig = PanelManager.PANEL_CONFIGS.find((c) => c.type === this.currentPanel);
    if (currentConfig) {
      this.footerBox.setContent(
        ` 当前: ${currentConfig.label} | 导航: [0-4]=切换 [Tab]=下一个 [Shift+Tab]=上一个 [r]=刷新 [q]=退出`
      );
      this.screen.render();
    }
  }

  /**
   * 获取缓存实例
   */
  getCache(): DataCache {
    return this.cache;
  }

  /**
   * 获取所有 Panel 配置
   */
  static getPanelConfigs(): PanelConfig[] {
    return PanelManager.PANEL_CONFIGS;
  }

  /**
   * 初始化（显示默认 Panel + 启动后台数据刷新）
   */
  init(): void {
    const defaultPanel = this.panels.get('overview');
    if (defaultPanel) {
      defaultPanel.show();
      this.currentPanel = 'overview';
      this.updateFooter();
    }

    // 启动统一后台数据刷新
    this.startBackgroundRefresh();
  }

  /**
   * 启动统一后台数据刷新
   *
   * 所有数据在后台自动刷新，面板只负责渲染
   */
  private startBackgroundRefresh(): void {
    // 服务健康 - 30秒刷新一次
    this.scheduleRefresh('services', 30000, async () => {
      const services = await this.dataService.fetchServicesHealth();
      this.cache.setServices(this.environment, services);
      this.refreshCurrentPanelView();
    });

    // EC2 资源 - 5分钟刷新一次
    this.scheduleRefresh('ec2', 300000, async () => {
      const ec2 = await this.dataService.fetchEC2Stats();
      this.cache.setEC2(this.environment, ec2);
      this.refreshCurrentPanelView();
    });

    // Docker 容器 - 30秒刷新一次
    this.scheduleRefresh('docker', 30000, async () => {
      const docker = await this.dataService.fetchDockerStats();
      this.cache.setDocker(this.environment, docker);
      this.refreshCurrentPanelView();
    });

    // 蓝绿部署 - 5秒刷新一次
    this.scheduleRefresh('bluegreen', 5000, async () => {
      try {
        const blueGreen = await this.blueGreenService.getBlueGreenDeployments();
        this.cache.setBlueGreen(this.environment, blueGreen);
        this.refreshCurrentPanelView();
      } catch {
        // 蓝绿部署可能不存在，忽略错误
      }
    });
  }

  /**
   * 调度定时刷新任务
   */
  private scheduleRefresh(name: string, interval: number, task: () => Promise<void>): void {
    // 立即执行一次
    task().catch((error) => {
      // 记录初始错误，但继续定时刷新
      console.error(`[${name}] Initial fetch failed:`, error.message || error);
    });

    // 设置定时器
    const timer = setInterval(async () => {
      try {
        await task();
      } catch (error: any) {
        // 记录后台刷新错误，但不中断
        console.error(`[${name}] Background refresh failed:`, error.message || error);
      }
    }, interval);

    this.refreshTimers.set(name, timer);
  }

  /**
   * 刷新当前面板视图（不重新获取数据，只重新渲染）
   */
  private refreshCurrentPanelView(): void {
    const panel = this.panels.get(this.currentPanel);
    if (panel && panel.visible()) {
      panel.render();
    }
  }

  /**
   * 销毁所有 Panel 和定时器
   */
  destroy(): void {
    // 停止所有后台刷新
    for (const timer of this.refreshTimers.values()) {
      clearInterval(timer);
    }
    this.refreshTimers.clear();

    // 销毁面板
    for (const panel of this.panels.values()) {
      panel.destroy();
    }
    this.headerBox.destroy();
    this.footerBox.destroy();
  }
}
