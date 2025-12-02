import blessed from 'neo-blessed';
import { BasePanel } from './BasePanel.js';
import { MonitorDataService } from '../../../services/monitor/MonitorDataService.js';
import { dashboardLogger } from '../../../utils/dashboard-logger.js';
import fs from 'fs';

/**
 * Overview Panel (Panel 0)
 *
 * 左右分栏布局：
 * - 左侧（60%）：系统整体健康状态概览
 * - 右侧（40%）：实时错误日志滚动
 */
export class OverviewPanel extends BasePanel {
  private dataService: MonitorDataService;
  private leftBox: any;  // 左侧概览框
  private rightBox: any; // 右侧日志框
  private errorLogs: string[] = []; // 错误日志缓存

  constructor(
    screen: any,
    config: any,
    cache: any,
    environment: string
  ) {
    super(screen, config, cache, environment);
    this.dataService = new MonitorDataService(environment);

    // 隐藏 BasePanel 的默认 container
    this.container.hide();

    // 创建左侧概览框（60% 宽度）
    this.leftBox = blessed.box({
      parent: screen,
      top: 3,
      bottom: 2,
      left: 0,
      width: '60%',
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
      },
      scrollable: true,
      alwaysScroll: true,
      keys: true,
      vi: true,
      mouse: true,
      label: ' 概览 ',
    });

    // 创建右侧日志框（40% 宽度）
    this.rightBox = blessed.box({
      parent: screen,
      top: 3,
      bottom: 2,
      left: '60%',
      width: '40%',
      tags: true,
      border: {
        type: 'line',
      },
      style: {
        fg: '#cdd6f4',
        bg: '#1e1e2e',
        border: {
          fg: '#f38ba8', // 红色边框表示错误日志
        },
      },
      scrollable: true,
      alwaysScroll: true,
      keys: true,
      vi: true,
      mouse: true,
      scrollbar: {
        ch: '█',
        style: {
          bg: '#313244',
          fg: '#f38ba8',
        },
      },
      label: ' 错误日志 ',
    });

    // 默认隐藏两个框
    this.leftBox.hide();
    this.rightBox.hide();
  }

  /**
   * 覆盖 BasePanel 的 show 方法
   *
   * 数据刷新由 PanelManager 统一管理，这里只负责显示和渲染
   */
  show(): void {
    this.isVisible = true;
    this.leftBox.show();
    this.rightBox.show();
    this.render(); // 立即渲染一次（从缓存读取）
    this.screen.render();
  }

  /**
   * 覆盖 BasePanel 的 hide 方法
   */
  hide(): void {
    this.isVisible = false;
    if (this.leftBox) this.leftBox.hide();
    if (this.rightBox) this.rightBox.hide();
  }

  /**
   * 手动刷新（按 'r' 键时调用）
   *
   * 注意：正常情况下不需要手动刷新，PanelManager 会后台自动刷新
   */
  async refresh(): Promise<void> {
    // 手动刷新时不做任何事，数据由 PanelManager 统一管理
    // 只重新渲染当前视图
    this.render();
  }

  render(): void {
    this.renderLeftPanel();
    this.renderRightPanel();
    this.screen.render();
  }

  /**
   * 渲染左侧概览面板
   */
  private renderLeftPanel(): void {
    const services = this.cache.getServices(this.environment);
    const ec2 = this.cache.getEC2(this.environment);

    let content = '';

    // === 服务健康概览 ===
    content += ' {cyan-fg}{bold}服务健康{/bold}{/cyan-fg}\n';
    if (services && services.length > 0) {
      const healthy = services.filter((s) => s.prod.health === 'healthy').length;
      const degraded = services.filter((s) => s.prod.health === 'degraded').length;
      const unhealthy = services.filter((s) => s.prod.health === 'unhealthy').length;

      content += `   总计: ${services.length} 个服务\n`;
      content += `   {green-fg}健康: ${healthy}{/green-fg}  `;
      content += `{yellow-fg}降级: ${degraded}{/yellow-fg}  `;
      content += `{red-fg}不健康: ${unhealthy}{/red-fg}\n`;

      // 显示不健康的服务
      if (unhealthy > 0) {
        const unhealthyServices = services.filter((s) => s.prod.health === 'unhealthy');
        content += `   {red-fg}⚠ 不健康服务: ${unhealthyServices.map((s) => s.name).join(', ')}{/red-fg}\n`;
      }
    } else {
      content += '   {yellow-fg}加载中...{/yellow-fg}\n';
    }

    content += '\n';

    // === EC2 资源概览 ===
    content += ' {cyan-fg}{bold}EC2 资源{/bold}{/cyan-fg}\n';
    if (ec2 && ec2.length > 0) {
      for (const stat of ec2) {
        const envLabels: Record<string, string> = {
          production: 'Production',
          stage: 'Stage',
          shared: 'Shared',
        };
        const envLabel = envLabels[stat.environment] || stat.environment;

        // 检查是否离线
        if (stat.offline) {
          content += `   {bold}${envLabel}{/bold} {red-fg}[离线]{/red-fg}\n`;
          content += `     {gray-fg}${stat.error || '连接超时'}{/gray-fg}\n`;
          continue;
        }

        // 检查其他错误
        if (stat.error) {
          content += `   {bold}${envLabel}{/bold} {yellow-fg}[错误]{/yellow-fg}\n`;
          content += `     {gray-fg}${stat.error}{/gray-fg}\n`;
          continue;
        }

        content += `   {bold}${envLabel}{/bold}\n`;

        // CPU 使用率
        if (stat.cpuUsage !== undefined) {
          const cpuPercent = stat.cpuUsage.toFixed(1);
          const cpuColor = stat.cpuUsage > 80 ? 'red' : stat.cpuUsage > 50 ? 'yellow' : 'green';
          content += `     CPU: {${cpuColor}-fg}${cpuPercent}%{/${cpuColor}-fg}\n`;
        }

        // 内存使用率（如果有数据）
        if (stat.memoryTotal > 0) {
          const memPercent = ((stat.memoryUsed / stat.memoryTotal) * 100).toFixed(0);
          const memColor = parseInt(memPercent) > 80 ? 'red' : parseInt(memPercent) > 50 ? 'yellow' : 'green';
          content += `     内存: {${memColor}-fg}${memPercent}%{/${memColor}-fg} (${stat.memoryUsed}MB / ${stat.memoryTotal}MB)\n`;
        }

        // 磁盘使用（只显示最高的，如果有数据）
        if (stat.disks && stat.disks.length > 0) {
          const maxDisk = stat.disks.reduce((max, disk) => (disk.percent > max.percent ? disk : max));
          const diskColor = maxDisk.percent > 80 ? 'red' : maxDisk.percent > 50 ? 'yellow' : 'green';
          content += `     磁盘: {${diskColor}-fg}${maxDisk.percent}%{/${diskColor}-fg} (${maxDisk.mountPoint})\n`;
        }
      }
    } else {
      content += '   {yellow-fg}加载中...{/yellow-fg}\n';
    }

    content += '\n';

    // === ECS 服务概览 (TODO) ===
    content += ' {cyan-fg}{bold}ECS 服务{/bold}{/cyan-fg}\n';
    content += '   {gray-fg}待实现 - 使用 [2] 查看详情{/gray-fg}\n';

    content += '\n';

    // === 提示信息 ===
    content += ' {gray-fg}提示: 按 [1-3] 查看详细信息{/gray-fg}\n';

    this.leftBox.setContent(content);
  }

  /**
   * 渲染右侧错误日志面板
   */
  private renderRightPanel(): void {
    try {
      const logPath = dashboardLogger.getLogPath();

      // 读取日志文件最后 100 行
      if (fs.existsSync(logPath)) {
        const logContent = fs.readFileSync(logPath, 'utf-8');
        const lines = logContent.split('\n');
        const recentLines = lines.slice(-100); // 最近 100 行

        // 只显示包含错误/警告的行
        const errorLines = recentLines.filter(line =>
          line.includes('error') ||
          line.includes('ERROR') ||
          line.includes('failed') ||
          line.includes('失败') ||
          line.includes('timeout') ||
          line.includes('Timed out') ||
          line.includes('离线') ||
          line.includes('不健康')
        );

        if (errorLines.length > 0) {
          let logText = ' {red-fg}{bold}最近错误（最多 100 条）{/bold}{/red-fg}\n\n';

          // 格式化每一行，提取时间戳和消息
          errorLines.forEach(line => {
            // 简化日志显示（移除冗长的部分）
            const simplified = line
              .replace(/^\d{4}-\d{2}-\d{2}T(\d{2}:\d{2}:\d{2}).*?\s+/, '$1 ') // 简化时间戳
              .substring(0, 80); // 限制长度避免换行混乱

            if (simplified.trim()) {
              logText += ` {gray-fg}${simplified}{/gray-fg}\n`;
            }
          });

          this.rightBox.setContent(logText);
        } else {
          this.rightBox.setContent(' {green-fg}✓ 无错误日志{/green-fg}\n\n {gray-fg}系统运行正常{/gray-fg}');
        }
      } else {
        this.rightBox.setContent(' {yellow-fg}⚠ 日志文件不存在{/yellow-fg}');
      }
    } catch (error: any) {
      this.rightBox.setContent(` {red-fg}读取日志失败: ${error.message}{/red-fg}`);
    }
  }
}
