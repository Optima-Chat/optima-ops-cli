import { BasePanel } from './BasePanel.js';
import { MonitorDataService } from '../../../services/monitor/MonitorDataService.js';
import type { DockerStats } from '../../../types/monitor.js';

/**
 * Docker Containers Panel (Panel 3)
 *
 * 显示 Docker 容器资源使用详情：
 * - 每个环境的容器列表
 * - CPU 使用率
 * - 内存使用（已用/总量）
 * - 网络 I/O（接收/发送）
 * - 资源告警（高 CPU/内存使用高亮）
 */
export class DockerPanel extends BasePanel {
  private dataService: MonitorDataService;

  constructor(
    screen: any,
    config: any,
    cache: any,
    environment: string
  ) {
    super(screen, config, cache, environment);
    this.dataService = new MonitorDataService(environment);
  }

  /**
   * 手动刷新（按 'r' 键时调用）
   *
   * 数据由 PanelManager 统一后台刷新，这里只重新渲染
   */
  async refresh(): Promise<void> {
    this.render();
  }

  render(): void {
    const dockerStats = this.cache.getDocker(this.environment);
    const dockerHistory = this.cache.getDockerHistory(this.environment);

    if (!dockerStats || dockerStats.length === 0) {
      this.showLoading('加载 Docker 数据...');
      return;
    }

    let content = '';

    // 按环境显示
    for (const envData of dockerStats) {
      const envLabels: Record<string, string> = {
        production: 'Production',
        stage: 'Stage',
        shared: 'Shared',
      };
      const envLabel = envLabels[envData.environment] || envData.environment;

      // 检查离线状态
      if (envData.offline) {
        content += ` {cyan-fg}{bold}${envLabel}{/bold}{/cyan-fg} {red-fg}[离线]{/red-fg}\n`;
        content += `   {gray-fg}${envData.error || 'SSH 连接超时，实例可能已关闭'}{/gray-fg}\n\n`;

        // 分隔线（不是最后一个环境时）
        if (dockerStats.indexOf(envData) < dockerStats.length - 1) {
          content += '   ' + '─'.repeat(70) + '\n\n';
        }
        continue;
      }

      // 检查其他错误
      if (envData.error) {
        content += ` {cyan-fg}{bold}${envLabel}{/bold}{/cyan-fg} {yellow-fg}[错误]{/yellow-fg}\n`;
        content += `   {gray-fg}${envData.error}{/gray-fg}\n\n`;

        // 分隔线（不是最后一个环境时）
        if (dockerStats.indexOf(envData) < dockerStats.length - 1) {
          content += '   ' + '─'.repeat(70) + '\n\n';
        }
        continue;
      }

      // 环境标题
      content += ` {cyan-fg}{bold}${envLabel}{/bold}{/cyan-fg} (${envData.stats.length} 容器)\n`;

      // 如果没有容器，显示提示
      if (envData.stats.length === 0) {
        content += '   {gray-fg}无运行中的容器{/gray-fg}\n\n';
      } else {
        // 表格头部
        content += ' {bold}容器                CPU   内存          版本/分支        运行时长  构建{/bold}\n';

        // 容器列表（紧凑表格格式）
        for (const stat of envData.stats) {
          // 容器名称（截断到20字符）
          const containerName = stat.container.length > 20
            ? stat.container.substring(0, 18) + '..'
            : stat.container.padEnd(20);

          // CPU
          const cpu = stat.cpuPercent.toFixed(1) + '%';
          const cpuColor = stat.cpuPercent > 80 ? 'red' : stat.cpuPercent > 50 ? 'yellow' : 'green';
          const cpuDisplay = `{${cpuColor}-fg}${cpu.padStart(5)}{/${cpuColor}-fg}`;

          // 内存（显示绝对值 + 趋势）
          const memPercent =
            stat.memoryTotal > 0 ? ((stat.memoryUsed / stat.memoryTotal) * 100).toFixed(0) : '0';
          const memColor = parseFloat(memPercent) > 80 ? 'red' : parseFloat(memPercent) > 50 ? 'yellow' : 'green';

          // 计算历史平均内存使用（用于趋势）
          const memTrend = this.calculateMemoryTrend(stat.container, envData.environment, dockerHistory);
          const memAbsolute = this.formatBytes(stat.memoryUsed);
          const memDisplay = `{${memColor}-fg}${memPercent.padStart(3)}%{/${memColor}-fg} ${memAbsolute.padEnd(4)} ${memTrend}`;

          // 版本/分支（优先显示 tag，其次 branch）
          let versionInfo = '';
          if (stat.buildTag) {
            versionInfo = `{green-fg}${stat.buildTag}{/green-fg}`;
          } else if (stat.buildBranch) {
            versionInfo = `{blue-fg}${stat.buildBranch}{/blue-fg}`;
          } else if (stat.buildCommit) {
            versionInfo = `{cyan-fg}${stat.buildCommit}{/cyan-fg}`;
          } else {
            versionInfo = '{gray-fg}-{/gray-fg}';
          }
          // 截断到16字符（考虑颜色标签）
          const versionPlain = stat.buildTag || stat.buildBranch || stat.buildCommit || '-';
          const versionPadding = Math.max(0, 16 - versionPlain.length);
          versionInfo = versionInfo + ' '.repeat(versionPadding);

          // 运行时长
          const uptimeDisplay = (stat.uptime || '-').padEnd(10);

          // 构建信息（commit 前8位）
          const buildInfo = stat.buildCommit
            ? `{gray-fg}${stat.buildCommit}{/gray-fg}`
            : '{gray-fg}-{/gray-fg}';

          // 组装行
          content += ` ${containerName} ${cpuDisplay} ${memDisplay}  ${versionInfo} ${uptimeDisplay} ${buildInfo}\n`;
        }

        content += '\n';
      }

      // 统计信息
      const totalContainers = envData.stats.length;
      const highCpu = envData.stats.filter((s) => s.cpuPercent > 80).length;
      const highMem = envData.stats.filter(
        (s) => s.memoryTotal > 0 && (s.memoryUsed / s.memoryTotal) * 100 > 80
      ).length;

      content += `   {bold}统计{/bold}\n`;
      content += `     总容器: ${totalContainers}\n`;

      if (highCpu > 0) {
        content += `     {red-fg}⚠ CPU 高负载: ${highCpu} 个容器{/red-fg}\n`;
      }
      if (highMem > 0) {
        content += `     {red-fg}⚠ 内存高使用: ${highMem} 个容器{/red-fg}\n`;
      }
      if (highCpu === 0 && highMem === 0) {
        content += `     {green-fg}✓ 所有容器资源正常{/green-fg}\n`;
      }

      content += '\n';

      // 分隔线（不是最后一个环境时）
      if (dockerStats.indexOf(envData) < dockerStats.length - 1) {
        content += '   ' + '─'.repeat(70) + '\n\n';
      }
    }

    this.container.setContent(content);
    this.screen.render();
  }

  /**
   * 格式化字节数
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0B';
    const k = 1024;
    const sizes = ['B', 'K', 'M', 'G'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    const value = bytes / Math.pow(k, i);
    return value.toFixed(1) + sizes[i];
  }

  /**
   * 计算内存趋势（当前值 vs 历史平均值）
   *
   * @param containerName 容器名称
   * @param environment 环境
   * @param history 历史数据
   * @returns 趋势指示器：↑ (上升), ↓ (下降), → (稳定), - (无历史数据)
   */
  private calculateMemoryTrend(
    containerName: string,
    environment: string,
    history: Array<{ data: any; timestamp: Date }>
  ): string {
    // 至少需要 3 个历史数据点才计算趋势
    if (!history || history.length < 3) {
      return '{gray-fg}-{/gray-fg}';
    }

    // 找到该容器在历史数据中的内存使用记录
    const memoryHistory: number[] = [];

    for (const point of history) {
      const envData = point.data.find((d: any) => d.environment === environment);
      if (envData && envData.stats) {
        const containerStat = envData.stats.find((s: any) => s.container === containerName);
        if (containerStat && containerStat.memoryUsed > 0) {
          memoryHistory.push(containerStat.memoryUsed);
        }
      }
    }

    // 至少需要 3 个数据点
    if (memoryHistory.length < 3) {
      return '{gray-fg}-{/gray-fg}';
    }

    // 计算历史平均值（除了最新的值）
    const historicalAvg =
      memoryHistory.slice(0, -1).reduce((sum, val) => sum + val, 0) / (memoryHistory.length - 1);

    // 当前值
    const current = memoryHistory[memoryHistory.length - 1];

    // 计算差异百分比
    const diffPercent = ((current - historicalAvg) / historicalAvg) * 100;

    // 趋势判断（±5% 以内视为稳定）
    if (diffPercent > 5) {
      return '{red-fg}↑{/red-fg}'; // 上升
    } else if (diffPercent < -5) {
      return '{green-fg}↓{/green-fg}'; // 下降
    } else {
      return '{gray-fg}→{/gray-fg}'; // 稳定
    }
  }
}
