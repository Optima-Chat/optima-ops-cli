import blessed from 'neo-blessed';
import type { ServiceHealth, EC2Stats } from '../../types/monitor.js';

export interface BlessedDashboardOptions {
  environment: string;
  refreshInterval: number;
}

// Catppuccin Mocha 配色方案
const COLORS = {
  green: '#a6e3a1',    // 成功/健康
  red: '#f38ba8',      // 错误/不健康
  yellow: '#f9e2af',   // 警告/降级
  blue: '#89b4fa',     // 信息/标题
  cyan: '#94e2d5',     // 边框
  mauve: '#cba6f7',    // 强调
  text: '#cdd6f4',     // 前景文字
  subtext: '#a6adc8',  // 次要文字
  surface: '#313244',  // 表面
  base: '#1e1e2e',     // 背景
};

export class BlessedDashboard {
  private screen: blessed.Widgets.Screen;
  private headerBox: blessed.Widgets.BoxElement;
  private serviceBox: blessed.Widgets.BoxElement;
  private ec2Box: blessed.Widgets.BoxElement;
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
      style: {
        fg: COLORS.text,
        bg: COLORS.base,
      },
    });

    // 创建布局容器
    this.headerBox = this.createHeader();
    this.serviceBox = this.createServiceBox();
    this.ec2Box = this.createEC2Box();
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

    // 主容器
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
        fg: COLORS.text,
        bg: COLORS.base,
        border: {
          fg: COLORS.blue,
        },
      },
    });

    // 左侧标题
    const titleBox = blessed.text({
      parent: container,
      top: 0,
      left: 1,
      content: `Optima ${envCapitalized} Monitor`,
      style: {
        fg: COLORS.mauve,
        bold: true,
      },
    });

    // 右侧信息（固定位置）
    const infoBox = blessed.text({
      parent: container,
      top: 0,
      right: 1,
      content: '',
      style: {
        fg: COLORS.subtext,
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

      infoBox.setContent(`Refresh: ${this.refreshInterval}s | ${timeStr}`);
      this.screen.render();
    };

    updateTime();
    this.timeInterval = setInterval(updateTime, 1000);

    return container;
  }

  private createServiceBox(): blessed.Widgets.BoxElement {
    return blessed.box({
      parent: this.screen,
      top: 3,
      left: 0,
      width: '50%',
      height: '100%-6',
      label: ' 服务健康 ',
      content: ' 加载中...',
      tags: true,
      border: {
        type: 'line',
      },
      style: {
        fg: COLORS.text,
        bg: COLORS.base,
        border: {
          fg: COLORS.cyan,
        },
        label: {
          fg: COLORS.green,
          bold: true,
        },
      },
      scrollable: true,
      alwaysScroll: true,
      scrollbar: {
        ch: '█',
        style: {
          bg: COLORS.surface,
          fg: COLORS.blue,
        },
      },
    });
  }

  private createEC2Box(): blessed.Widgets.BoxElement {
    return blessed.box({
      parent: this.screen,
      top: 3,
      left: '50%',
      width: '50%',
      height: '100%-6',
      label: ' EC2 资源 ',
      content: ' 加载中...',
      tags: true,
      border: {
        type: 'line',
      },
      style: {
        fg: COLORS.text,
        bg: COLORS.base,
        border: {
          fg: COLORS.cyan,
        },
        label: {
          fg: COLORS.yellow,
          bold: true,
        },
      },
      scrollable: true,
      alwaysScroll: true,
      scrollbar: {
        ch: '█',
        style: {
          bg: COLORS.surface,
          fg: COLORS.blue,
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
        fg: COLORS.subtext,
        bg: COLORS.base,
        border: {
          fg: COLORS.surface,
        },
      },
    });
  }

  // 辅助函数：生成带颜色的健康状态
  private getColoredHealthIcon(health: 'healthy' | 'degraded' | 'unhealthy'): string {
    if (health === 'healthy') {
      return '{green-fg}✓{/green-fg}';
    } else if (health === 'degraded') {
      return '{yellow-fg}⚠{/yellow-fg}';
    } else {
      return '{red-fg}✗{/red-fg}';
    }
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

    let content = ` {cyan-fg}核心服务{/cyan-fg} (${coreServices.length})\n`;
    content += ' {bold}服务               Prod      Stage{/bold}\n';

    coreServices.forEach((svc) => {
      const name = svc.name.padEnd(18);

      // Prod 状态
      const prodIcon = this.getColoredHealthIcon(svc.prod.health);
      const prodTime = svc.prod.responseTime > 0 ? `${svc.prod.responseTime}ms` : '-';
      const prodStatus = `${prodIcon} ${prodTime.padEnd(6)}`;

      // Stage 状态
      const stageIcon = svc.stage ? this.getColoredHealthIcon(svc.stage.health) : '{gray-fg}-{/gray-fg}';
      const stageTime = svc.stage && svc.stage.responseTime > 0 ? `${svc.stage.responseTime}ms` : '-';
      const stageStatus = `${stageIcon} ${stageTime.padEnd(6)}`;

      content += ` ${name} ${prodStatus} ${stageStatus}\n`;
    });

    content += `\n {cyan-fg}MCP 工具{/cyan-fg} (${mcpServices.length})\n`;
    content += ' {bold}服务               Prod      Stage{/bold}\n';

    mcpServices.forEach((svc) => {
      const name = svc.name.padEnd(18);

      // Prod 状态
      const prodIcon = this.getColoredHealthIcon(svc.prod.health);
      const prodTime = svc.prod.responseTime > 0 ? `${svc.prod.responseTime}ms` : '-';
      const prodStatus = `${prodIcon} ${prodTime.padEnd(6)}`;

      // Stage 状态
      const stageIcon = svc.stage ? this.getColoredHealthIcon(svc.stage.health) : '{gray-fg}-{/gray-fg}';
      const stageTime = svc.stage && svc.stage.responseTime > 0 ? `${svc.stage.responseTime}ms` : '-';
      const stageStatus = `${stageIcon} ${stageTime.padEnd(6)}`;

      content += ` ${name} ${prodStatus} ${stageStatus}\n`;
    });

    this.serviceBox.setContent(content);
    this.screen.render();
  }

  public updateEC2(ec2Stats: EC2Stats[], loading: boolean): void {
    if (loading) {
      this.ec2Box.setContent(' 加载 EC2 资源...');
      this.screen.render();
      return;
    }

    if (ec2Stats.length === 0) {
      this.ec2Box.setContent(' 无 EC2 数据');
      this.screen.render();
      return;
    }

    let content = '';

    ec2Stats.forEach((stat) => {
      const envLabels: Record<string, string> = { production: 'Production', stage: 'Stage', shared: 'Shared' };
      const envLabel = envLabels[stat.environment] || stat.environment;
      content += ` {cyan-fg}${envLabel}{/cyan-fg}\n`;
      content += ` {bold}实例类型{/bold}: ${stat.instanceType}\n`;
      content += ` {bold}实例 ID{/bold}:  ${stat.instanceId}\n`;
      content += ` {bold}运行时间{/bold}: ${stat.uptime}\n`;

      // 内存
      const memPercent =
        stat.memoryTotal > 0 ? ((stat.memoryUsed / stat.memoryTotal) * 100).toFixed(0) : '0';
      const memColor =
        parseInt(memPercent) > 80 ? 'red' : parseInt(memPercent) > 50 ? 'yellow' : 'green';
      content += ` {bold}内存{/bold}:     {${memColor}-fg}${stat.memoryUsed}MB / ${stat.memoryTotal}MB (${memPercent}%){/${memColor}-fg}\n`;

      // 磁盘 - 显示所有分区
      if (stat.disks && stat.disks.length > 0) {
        content += ` {bold}磁盘{/bold}:\n`;
        stat.disks.forEach((disk) => {
          const diskColor =
            disk.percent > 80 ? 'red' : disk.percent > 50 ? 'yellow' : 'green';
          const mountLabel = disk.mountPoint.padEnd(6);
          content += `   ${mountLabel} {${diskColor}-fg}${disk.used}GB / ${disk.total}GB (${disk.percent}%){/${diskColor}-fg}\n`;
        });
      } else {
        // 向后兼容：如果没有 disks 数组，显示旧格式
        const diskPercent =
          stat.diskTotal > 0 ? ((stat.diskUsed / stat.diskTotal) * 100).toFixed(0) : '0';
        const diskColor =
          parseInt(diskPercent) > 80 ? 'red' : parseInt(diskPercent) > 50 ? 'yellow' : 'green';
        content += ` {bold}磁盘{/bold}:     {${diskColor}-fg}${stat.diskUsed}GB / ${stat.diskTotal}GB (${diskPercent}%){/${diskColor}-fg}\n`;
      }

      content += '\n';
    });

    this.ec2Box.setContent(content);
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
