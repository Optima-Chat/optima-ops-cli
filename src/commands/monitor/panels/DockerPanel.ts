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

  async refresh(): Promise<void> {
    this.showLoading('刷新 Docker 容器数据...');

    try {
      const dockerStats = await this.dataService.fetchDockerStats();

      // 更新缓存
      this.cache.setDocker(this.environment, dockerStats);

      this.render();
    } catch (error: any) {
      this.showError(error.message);
    }
  }

  render(): void {
    const dockerStats = this.cache.getDocker(this.environment);

    if (!dockerStats || dockerStats.length === 0) {
      this.showEmpty('无 Docker 数据');
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
        content += ` {cyan-fg}{bold}${envLabel}{/bold}{/cyan-fg} {red-fg}[离线]{/red-fg}\\n`;
        content += `   {gray-fg}${envData.error || 'SSH 连接超时，实例可能已关闭'}{/gray-fg}\\n\\n`;

        // 分隔线（不是最后一个环境时）
        if (dockerStats.indexOf(envData) < dockerStats.length - 1) {
          content += '   ' + '─'.repeat(70) + '\\n\\n';
        }
        continue;
      }

      // 检查其他错误
      if (envData.error) {
        content += ` {cyan-fg}{bold}${envLabel}{/bold}{/cyan-fg} {yellow-fg}[错误]{/yellow-fg}\\n`;
        content += `   {gray-fg}${envData.error}{/gray-fg}\\n\\n`;

        // 分隔线（不是最后一个环境时）
        if (dockerStats.indexOf(envData) < dockerStats.length - 1) {
          content += '   ' + '─'.repeat(70) + '\\n\\n';
        }
        continue;
      }

      // 环境标题
      content += ` {cyan-fg}{bold}${envLabel}{/bold}{/cyan-fg} (${envData.stats.length} 容器)\\n`;
      content += ' {bold}容器                             CPU    内存       网络{/bold}\\n';

      // 容器列表
      for (const stat of envData.stats) {
        const container = stat.container.substring(0, 30).padEnd(30);
        const cpu = stat.cpuPercent.toFixed(1) + '%';
        const memPercent =
          stat.memoryTotal > 0 ? ((stat.memoryUsed / stat.memoryTotal) * 100).toFixed(0) + '%' : '-';
        const mem = `${this.formatBytes(stat.memoryUsed)}/${this.formatBytes(stat.memoryTotal)}`;
        const net = `${this.formatBytes(stat.networkRx)}↓ ${this.formatBytes(stat.networkTx)}↑`;

        // CPU 颜色
        const cpuColor = stat.cpuPercent > 80 ? 'red' : stat.cpuPercent > 50 ? 'yellow' : 'green';
        const cpuDisplay = `{${cpuColor}-fg}${cpu.padEnd(6)}{/${cpuColor}-fg}`;

        // 内存颜色
        const memPercentNum = stat.memoryTotal > 0 ? (stat.memoryUsed / stat.memoryTotal) * 100 : 0;
        const memColor = memPercentNum > 80 ? 'red' : memPercentNum > 50 ? 'yellow' : 'green';
        const memDisplay = `{${memColor}-fg}${mem.padEnd(10)}{/${memColor}-fg}`;

        content += ` ${container} ${cpuDisplay} ${memDisplay} ${net}\\n`;
      }

      content += '\\n';

      // 统计信息
      const totalContainers = envData.stats.length;
      const highCpu = envData.stats.filter((s) => s.cpuPercent > 80).length;
      const highMem = envData.stats.filter(
        (s) => s.memoryTotal > 0 && (s.memoryUsed / s.memoryTotal) * 100 > 80
      ).length;

      content += `   {bold}统计{/bold}\\n`;
      content += `     总容器: ${totalContainers}\\n`;

      if (highCpu > 0) {
        content += `     {red-fg}⚠ CPU 高负载: ${highCpu} 个容器{/red-fg}\\n`;
      }
      if (highMem > 0) {
        content += `     {red-fg}⚠ 内存高使用: ${highMem} 个容器{/red-fg}\\n`;
      }
      if (highCpu === 0 && highMem === 0) {
        content += `     {green-fg}✓ 所有容器资源正常{/green-fg}\\n`;
      }

      content += '\\n';

      // 分隔线（不是最后一个环境时）
      if (dockerStats.indexOf(envData) < dockerStats.length - 1) {
        content += '   ' + '─'.repeat(70) + '\\n\\n';
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
