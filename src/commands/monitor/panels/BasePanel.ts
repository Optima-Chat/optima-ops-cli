import blessed from 'neo-blessed';
import type { PanelType, PanelConfig } from '../../../types/monitor.js';
import type { DataCache } from '../../../services/monitor/DataCache.js';

/**
 * Panel 抽象基类
 *
 * 所有 Panel 都继承此类，实现统一的生命周期和接口
 */
export abstract class BasePanel {
  protected screen: blessed.Widgets.Screen;
  protected container: blessed.Widgets.BoxElement;
  protected config: PanelConfig;
  protected cache: DataCache;
  protected environment: string;
  protected isVisible: boolean;
  protected refreshTimer: NodeJS.Timeout | null;

  constructor(
    screen: blessed.Widgets.Screen,
    config: PanelConfig,
    cache: DataCache,
    environment: string
  ) {
    this.screen = screen;
    this.config = config;
    this.cache = cache;
    this.environment = environment;
    this.isVisible = false;
    this.refreshTimer = null;

    // 创建主容器
    this.container = blessed.box({
      parent: screen,
      top: 3, // 为 header 留空间 (header 高度 3)
      bottom: 2, // 为 footer 留空间 (footer 高度 2)
      left: 0,
      width: '100%',
      label: ` ${config.label} `,
      tags: true,
      border: {
        type: 'line',
      },
      style: {
        fg: '#cdd6f4',
        bg: '#1e1e2e',
        border: {
          fg: '#94e2d5',
        },
        label: {
          fg: '#89b4fa',
          bold: true,
        },
      },
      scrollable: true,
      alwaysScroll: true,
      scrollbar: {
        ch: '█',
        style: {
          bg: '#313244',
          fg: '#89b4fa',
        },
      },
    });

    // 默认隐藏
    this.hide();
  }

  /**
   * 显示 Panel
   */
  show(): void {
    this.isVisible = true;
    this.container.show();
    this.screen.render();
    this.startAutoRefresh();
  }

  /**
   * 隐藏 Panel
   */
  hide(): void {
    this.isVisible = false;
    this.container.hide();
    this.stopAutoRefresh();
  }

  /**
   * 开始自动刷新
   */
  private startAutoRefresh(): void {
    // 立即刷新一次
    this.refresh().catch((error) => {
      this.showError(`刷新失败: ${error.message}`);
    });

    // 设置定时刷新
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }

    this.refreshTimer = setInterval(() => {
      if (this.isVisible) {
        this.refresh().catch((error) => {
          this.showError(`刷新失败: ${error.message}`);
        });
      }
    }, this.config.refreshInterval);
  }

  /**
   * 停止自动刷新
   */
  private stopAutoRefresh(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  /**
   * 刷新数据（子类实现）
   */
  abstract refresh(): Promise<void>;

  /**
   * 渲染内容（子类实现）
   */
  abstract render(): void;

  /**
   * 显示加载状态
   */
  protected showLoading(message: string = '加载中...'): void {
    this.container.setContent(` ${message}`);
    this.screen.render();
  }

  /**
   * 显示错误
   */
  protected showError(message: string): void {
    this.container.setContent(` {red-fg}✗{/red-fg} ${message}`);
    this.screen.render();
  }

  /**
   * 显示空数据
   */
  protected showEmpty(message: string = '无数据'): void {
    this.container.setContent(` {yellow-fg}⚠{/yellow-fg} ${message}`);
    this.screen.render();
  }

  /**
   * 销毁 Panel
   */
  destroy(): void {
    this.stopAutoRefresh();
    this.container.destroy();
  }

  /**
   * 获取 Panel 类型
   */
  getType(): PanelType {
    return this.config.type;
  }

  /**
   * 获取 Panel 配置
   */
  getConfig(): PanelConfig {
    return this.config;
  }

  /**
   * 检查是否可见
   */
  visible(): boolean {
    return this.isVisible;
  }
}
