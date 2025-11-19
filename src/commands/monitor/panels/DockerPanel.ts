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
      content += ` {cyan-fg}{bold}${envLabel}{/bold}{/cyan-fg} (${envData.stats.length} 容器)\n\n`;

      // 容器列表（详细信息）
      for (const stat of envData.stats) {
        // 容器名称和状态
        const statusColor = stat.status === 'running' ? 'green' : 'yellow';
        content += `   {bold}${stat.container}{/bold} {${statusColor}-fg}[${stat.status || 'unknown'}]{/${statusColor}-fg}\n`;

        // 运行时长和启动时间
        if (stat.uptime) {
          content += `     {gray-fg}运行时长:{/gray-fg} ${stat.uptime}`;
          if (stat.startedAt) {
            const startTime = new Date(stat.startedAt).toLocaleString('zh-CN', {
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
            });
            content += ` {gray-fg}(启动于 ${startTime}){/gray-fg}`;
          }
          content += '\n';
        }

        // 镜像信息
        if (stat.imageTag) {
          content += `     {gray-fg}镜像:{/gray-fg} ${stat.imageTag}`;
          if (stat.imageId) {
            content += ` {gray-fg}(${stat.imageId}){/gray-fg}`;
          }
          content += '\n';
        }

        // 构建信息
        if (stat.buildCommit || stat.buildBranch || stat.buildWorkflow) {
          content += `     {gray-fg}构建:{/gray-fg}`;
          if (stat.buildCommit) {
            content += ` {cyan-fg}${stat.buildCommit}{/cyan-fg}`;
          }
          if (stat.buildBranch) {
            content += ` @ {blue-fg}${stat.buildBranch}{/blue-fg}`;
          }
          if (stat.buildWorkflow) {
            content += ` via {magenta-fg}${stat.buildWorkflow}{/magenta-fg}`;
          }
          content += '\n';
        }

        // 资源使用
        const cpu = stat.cpuPercent.toFixed(1) + '%';
        const memPercent =
          stat.memoryTotal > 0 ? ((stat.memoryUsed / stat.memoryTotal) * 100).toFixed(0) : '0';
        const mem = `${this.formatBytes(stat.memoryUsed)}/${this.formatBytes(stat.memoryTotal)}`;
        const net = `${this.formatBytes(stat.networkRx)}↓ ${this.formatBytes(stat.networkTx)}↑`;

        // CPU 颜色
        const cpuColor = stat.cpuPercent > 80 ? 'red' : stat.cpuPercent > 50 ? 'yellow' : 'green';
        const memColor = parseFloat(memPercent) > 80 ? 'red' : parseFloat(memPercent) > 50 ? 'yellow' : 'green';

        content += `     {gray-fg}资源:{/gray-fg} CPU {${cpuColor}-fg}${cpu}{/${cpuColor}-fg} | `;
        content += `内存 {${memColor}-fg}${mem} (${memPercent}%){/${memColor}-fg} | `;
        content += `网络 ${net}\n`;

        content += '\n';
      }

      // 如果没有容器，显示提示
      if (envData.stats.length === 0) {
        content += '   {gray-fg}无运行中的容器{/gray-fg}\n\n';
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
}
