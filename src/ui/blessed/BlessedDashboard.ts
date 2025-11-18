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
      return process.exit(0);
    });

    // 渲染初始界面
    this.screen.render();
  }

  private createHeader(): blessed.Widgets.BoxElement {
    const envCapitalized = this.environment.charAt(0).toUpperCase() + this.environment.slice(1);

    return blessed.box({
      parent: this.screen,
      top: 0,
      left: 0,
      width: '100%',
      height: 3,
      content: `{bold}{cyan-fg}⚡ Optima ${envCapitalized} Monitor{/cyan-fg}{/bold}                    {#888-fg}刷新间隔: ${this.refreshInterval}s{/#888-fg}`,
      tags: true,
      border: {
        type: 'line',
        fg: 'cyan',
      },
      style: {
        border: {
          fg: 'cyan',
        },
      },
    });
  }

  private createServiceBox(): blessed.Widgets.BoxElement {
    return blessed.box({
      parent: this.screen,
      top: 3,
      left: 0,
      width: '50%',
      height: '40%',
      label: ' 🏥 服务健康 ',
      content: '{#888-fg}加载中...{/#888-fg}',
      tags: true,
      border: {
        type: 'line',
      },
      scrollable: true,
      alwaysScroll: true,
      scrollbar: {
        ch: ' ',
        style: {
          bg: 'blue',
        },
      },
    });
  }

  private createBlueGreenBox(): blessed.Widgets.BoxElement {
    return blessed.box({
      parent: this.screen,
      top: '43%',
      left: 0,
      width: '50%',
      height: '50%-3',
      label: ' 🔵 蓝绿部署 ',
      content: '{#888-fg}加载中...{/#888-fg}',
      tags: true,
      border: {
        type: 'line',
      },
      scrollable: true,
      alwaysScroll: true,
    });
  }

  private createDockerBox(): blessed.Widgets.BoxElement {
    return blessed.box({
      parent: this.screen,
      top: 3,
      left: '50%',
      width: '50%',
      height: '90%-3',
      label: ' 🐳 Docker 资源 ',
      content: '{#888-fg}加载中...{/#888-fg}',
      tags: true,
      border: {
        type: 'line',
      },
      scrollable: true,
      alwaysScroll: true,
      scrollbar: {
        ch: ' ',
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
      content: '{#888-fg}快捷键: {/}{bold}q{/bold}=退出 {bold}d{/bold}=部署 {bold}r{/bold}=回滚 {bold}t{/bold}=调整流量 {bold}l{/bold}=日志',
      tags: true,
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
      this.serviceBox.setContent('{#888-fg}加载服务状态...{/#888-fg}');
      this.screen.render();
      return;
    }

    const coreServices = services.filter((s) => s.type === 'core');
    const mcpServices = services.filter((s) => s.type === 'mcp');

    let content = `{bold}{cyan-fg}核心服务 (${coreServices.length}){/cyan-fg}{/bold}\n`;
    content += '{#888-fg}服务                  状态  响应时间{/#888-fg}\n';

    coreServices.forEach((svc) => {
      const icon = svc.health === 'healthy' ? '✓' : svc.health === 'degraded' ? '⚠' : '✗';
      const color = svc.health === 'healthy' ? 'green' : svc.health === 'degraded' ? 'yellow' : 'red';
      const name = svc.name.padEnd(20);
      const time = svc.responseTime > 0 ? `${svc.responseTime}ms` : '-';

      content += `${name} {${color}-fg}${icon}{/${color}-fg}    ${time}\n`;
    });

    content += `\n{bold}{magenta-fg}MCP 工具 (${mcpServices.length}){/magenta-fg}{/bold}\n`;
    content += '{#888-fg}服务                  状态  响应时间{/#888-fg}\n';

    mcpServices.forEach((svc) => {
      const icon = svc.health === 'healthy' ? '✓' : svc.health === 'degraded' ? '⚠' : '✗';
      const color = svc.health === 'healthy' ? 'green' : svc.health === 'degraded' ? 'yellow' : 'red';
      const name = svc.name.padEnd(20);
      const time = svc.responseTime > 0 ? `${svc.responseTime}ms` : '-';

      content += `${name} {${color}-fg}${icon}{/${color}-fg}    ${time}\n`;
    });

    this.serviceBox.setContent(content);
    this.screen.render();
  }

  public updateBlueGreen(statuses: BlueGreenStatus[], loading: boolean): void {
    if (loading) {
      this.blueGreenBox.setContent('{#888-fg}加载蓝绿部署状态...{/#888-fg}');
      this.screen.render();
      return;
    }

    let content = '{#888-fg}服务              Blue任务  Green任务  流量分配{/#888-fg}\n';

    statuses.forEach((status) => {
      const name = status.service.padEnd(16);
      const blue = `${status.blue.running}/${status.blue.desired}`.padEnd(9);
      const green = `${status.green.running}/${status.green.desired}`.padEnd(10);
      const traffic = `B:${status.traffic.blue}% G:${status.traffic.green}%`;

      content += `${name} {blue-fg}${blue}{/blue-fg} {green-fg}${green}{/green-fg} ${traffic}\n`;
    });

    this.blueGreenBox.setContent(content);
    this.screen.render();
  }

  public updateDocker(stats: DockerStats[], loading: boolean): void {
    if (loading) {
      this.dockerBox.setContent('{#888-fg}加载 Docker 资源...{/#888-fg}');
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

    let content = '{#888-fg}容器                          CPU      内存                 网络 Rx/Tx{/#888-fg}\n';

    stats.forEach((stat) => {
      const container = stat.container.substring(0, 28).padEnd(30);
      const cpu = stat.cpuPercent.toFixed(1) + '%';
      const cpuColor = stat.cpuPercent > 80 ? 'red' : 'white';
      const mem = formatBytes(stat.memoryUsed) + '/' + formatBytes(stat.memoryTotal);
      const memPercent = (stat.memoryUsed / stat.memoryTotal) * 100;
      const memColor = memPercent > 80 ? 'red' : 'white';
      const net = formatBytes(stat.networkRx) + '/' + formatBytes(stat.networkTx);

      content += `${container} {${cpuColor}-fg}${cpu.padEnd(8)}{/${cpuColor}-fg} {${memColor}-fg}${mem.padEnd(20)}{/${memColor}-fg} {#888-fg}${net}{/#888-fg}\n`;
    });

    this.dockerBox.setContent(content);
    this.screen.render();
  }

  public destroy(): void {
    this.screen.destroy();
  }
}
