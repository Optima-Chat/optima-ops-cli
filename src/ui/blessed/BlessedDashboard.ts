import blessed from 'neo-blessed';
import type { ServiceHealth, BlueGreenStatus, DockerStats } from '../../types/monitor.js';

export interface BlessedDashboardOptions {
  environment: string;
  refreshInterval: number;
}

export class BlessedDashboard {
  private screen: blessed.Widgets.Screen;
  private headerBox: blessed.Widgets.BoxElement;
  private serviceBox: blessed.Widgets.BoxElement;
  private blueGreenBox: blessed.Widgets.BoxElement;
  private dockerBox: blessed.Widgets.BoxElement;
  private keyHintsBox: blessed.Widgets.BoxElement;
  private environment: string;
  private refreshInterval: number;
  private timeInterval: NodeJS.Timeout | null = null;

  constructor(options: BlessedDashboardOptions) {
    this.environment = options.environment;
    this.refreshInterval = options.refreshInterval;

    // 创建 screen
    this.screen = blessed.screen({
      smartCSR: true, // 智能光标定位，只更新变化部分
      title: `Optima ${this.environment} Monitor`,
      fullUnicode: true,
    });

    // 创建布局容器
    this.headerBox = this.createHeader();
    this.serviceBox = this.createServiceBox();
    this.blueGreenBox = this.createBlueGreenBox();
    this.dockerBox = this.createDockerBox();
    this.keyHintsBox = this.createKeyHints();

    // 绑定退出键
    this.screen.key(['escape', 'q', 'C-c'], () => {
      this.destroy();
      return process.exit(0);
    });

    // 初始渲染
    this.screen.render();
  }

  private createHeader(): blessed.Widgets.BoxElement {
    const envCapitalized = this.environment.charAt(0).toUpperCase() + this.environment.slice(1);

    const box = blessed.box({
      parent: this.screen,
      top: 0,
      left: 0,
      width: '100%',
      height: 3,
      tags: true,
      border: {
        type: 'line',
      },
      style: {
        border: {
          fg: 'cyan',
        },
      },
    });

    // 更新时间显示
    const updateTime = () => {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const hour = String(now.getHours()).padStart(2, '0');
      const minute = String(now.getMinutes()).padStart(2, '0');
      const second = String(now.getSeconds()).padStart(2, '0');
      const timeStr = `${year}/${month}/${day} ${hour}:${minute}:${second}`;

      // 简单布局，避免标签长度计算问题
      const content = ` ⚡ Optima ${envCapitalized} Monitor     刷新: ${this.refreshInterval}s | ${timeStr}`;
      box.setContent(content);
      this.screen.render();
    };

    updateTime();
    this.timeInterval = setInterval(updateTime, 1000);

    return box;
  }

  private createServiceBox(): blessed.Widgets.BoxElement {
    return blessed.box({
      parent: this.screen,
      top: 3,
      left: 0,
      width: '50%',
      height: 20, // 增加到 20 行
      label: ' 🏥 服务健康 ',
      content: ' 加载中...',
      border: {
        type: 'line',
      },
      scrollable: true,
      alwaysScroll: true,
      scrollbar: {
        ch: '█',
        style: {
          bg: 'blue',
        },
      },
    });
  }

  private createBlueGreenBox(): blessed.Widgets.BoxElement {
    return blessed.box({
      parent: this.screen,
      top: 23,
      left: 0,
      width: '50%',
      height: '100%-26', // 剩余空间
      label: ' 🔵 蓝绿部署 ',
      content: ' 加载中...',
      border: {
        type: 'line',
      },
      scrollable: true,
      alwaysScroll: true,
      scrollbar: {
        ch: '█',
        style: {
          bg: 'blue',
        },
      },
    });
  }

  private createDockerBox(): blessed.Widgets.BoxElement {
    return blessed.box({
      parent: this.screen,
      top: 3,
      left: '50%',
      width: '50%',
      height: '100%-6',
      label: ' 🐳 Docker 资源 ',
      content: ' 加载中...',
      border: {
        type: 'line',
      },
      scrollable: true,
      alwaysScroll: true,
      scrollbar: {
        ch: '█',
        style: {
          bg: 'blue',
        },
      },
    });
  }

  private createKeyHints(): blessed.Widgets.BoxElement {
    return blessed.box({
      parent: this.screen,
      bottom: 0,
      left: 0,
      width: '100%',
      height: 3,
      content: ' 快捷键: [q]=退出 [d]=部署 [r]=回滚 [t]=调整流量 [l]=日志',
      border: {
        type: 'single',
      },
      style: {
        border: {
          fg: 'gray',
        },
      },
    });
  }

  public updateServices(services: ServiceHealth[], loading: boolean): void {
    if (loading) {
      this.serviceBox.setContent(' 加载服务状态...');
      this.screen.render();
      return;
    }

    if (services.length === 0) {
      this.serviceBox.setContent(' 无服务数据');
      this.screen.render();
      return;
    }

    const coreServices = services.filter((s) => s.type === 'core');
    const mcpServices = services.filter((s) => s.type === 'mcp');

    let content = ` 核心服务 (${coreServices.length})\n`;
    content += ' 服务                  状态  响应时间\n';

    coreServices.forEach((svc) => {
      const icon = svc.health === 'healthy' ? '✓' : svc.health === 'degraded' ? '⚠' : '✗';
      const name = svc.name.padEnd(20);
      const time = svc.responseTime > 0 ? `${svc.responseTime}ms` : '-';
      const statusLine = `${icon} `;

      content += ` ${name} ${statusLine} ${time}\n`;
    });

    content += `\n MCP 工具 (${mcpServices.length})\n`;
    content += ' 服务                  状态  响应时间\n';

    mcpServices.forEach((svc) => {
      const icon = svc.health === 'healthy' ? '✓' : svc.health === 'degraded' ? '⚠' : '✗';
      const name = svc.name.padEnd(20);
      const time = svc.responseTime > 0 ? `${svc.responseTime}ms` : '-';
      const statusLine = `${icon} `;

      content += ` ${name} ${statusLine} ${time}\n`;
    });

    this.serviceBox.setContent(content);
    this.screen.render();
  }

  public updateBlueGreen(statuses: BlueGreenStatus[], loading: boolean): void {
    if (loading) {
      this.blueGreenBox.setContent(' 加载蓝绿部署状态...');
      this.screen.render();
      return;
    }

    if (statuses.length === 0) {
      this.blueGreenBox.setContent(' 无蓝绿部署数据（可能未使用 ECS）');
      this.screen.render();
      return;
    }

    let content = ' 服务              Blue任务  Green任务  流量分配\n';

    statuses.forEach((status) => {
      const name = status.service.padEnd(16);
      const blue = `${status.blue.running}/${status.blue.desired}`.padEnd(9);
      const green = `${status.green.running}/${status.green.desired}`.padEnd(10);
      const traffic = `B:${status.traffic.blue}% G:${status.traffic.green}%`;

      content += ` ${name} ${blue} ${green} ${traffic}\n`;
    });

    this.blueGreenBox.setContent(content);
    this.screen.render();
  }

  public updateDocker(stats: DockerStats[], loading: boolean): void {
    if (loading) {
      this.dockerBox.setContent(' 加载 Docker 资源...');
      this.screen.render();
      return;
    }

    if (stats.length === 0) {
      this.dockerBox.setContent(' 无 Docker 数据');
      this.screen.render();
      return;
    }

    const formatBytes = (bytes: number): string => {
      if (bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      const value = bytes / Math.pow(k, i);
      return value.toFixed(2) + ' ' + sizes[i];
    };

    let content = ' 容器                          CPU      内存                 网络 Rx/Tx\n';

    stats.forEach((stat) => {
      const container = stat.container.substring(0, 28).padEnd(30);
      const cpu = stat.cpuPercent.toFixed(1) + '%';
      const mem = formatBytes(stat.memoryUsed) + '/' + formatBytes(stat.memoryTotal);
      const net = formatBytes(stat.networkRx) + '/' + formatBytes(stat.networkTx);

      content += ` ${container} ${cpu.padEnd(8)} ${mem.padEnd(20)} ${net}\n`;
    });

    this.dockerBox.setContent(content);
    this.screen.render();
  }

  public destroy(): void {
    if (this.timeInterval) {
      clearInterval(this.timeInterval);
      this.timeInterval = null;
    }
    this.screen.destroy();
  }
}
