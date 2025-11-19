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

    // 创建 Header 和 Footer
    this.headerBox = this.createHeader();
    this.footerBox = this.createFooter();

    // 绑定键盘事件
    this.bindKeys();
  }

  /**
   * 创建 Header
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
      content: `Optima ${envCapitalized} Monitor`,
      style: {
        fg: '#cba6f7',
        bold: true,
      },
    });

    // 右侧时间（稍后实现动态更新）
    const timeBox = blessed.text({
      parent: container,
      top: 0,
      right: 1,
      content: '',
      style: {
        fg: '#a6adc8',
      },
    });

    // 更新时间
    const updateTime = () => {
      const now = new Date();
      const timeStr = now.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      });
      timeBox.setContent(timeStr);
      this.screen.render();
    };

    updateTime();
    setInterval(updateTime, 1000);

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
      content: ' 导航: [0-4]=切换面板 [Tab/Shift+Tab]=循环 [r]=刷新 [q]=退出',
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
   * 初始化（显示默认 Panel）
   */
  init(): void {
    const defaultPanel = this.panels.get('overview');
    if (defaultPanel) {
      defaultPanel.show();
      this.currentPanel = 'overview';
      this.updateFooter();
    }
  }

  /**
   * 销毁所有 Panel
   */
  destroy(): void {
    for (const panel of this.panels.values()) {
      panel.destroy();
    }
    this.headerBox.destroy();
    this.footerBox.destroy();
  }
}
