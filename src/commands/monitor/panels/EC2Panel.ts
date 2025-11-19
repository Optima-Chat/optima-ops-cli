import { BasePanel } from './BasePanel.js';
import { MonitorDataService } from '../../../services/monitor/MonitorDataService.js';
import type { EC2Stats } from '../../../types/monitor.js';

/**
 * EC2 Resources Panel (Panel 2)
 *
 * 显示 EC2 实例资源使用详情：
 * - 实例信息（ID、类型、运行时间）
 * - 内存使用（已用/总量/百分比）
 * - 磁盘使用（所有分区详情）
 * - 资源告警（超过阈值高亮显示）
 */
export class EC2Panel extends BasePanel {
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
    this.showLoading('刷新 EC2 资源数据...');

    try {
      const ec2Stats = await this.dataService.fetchEC2Stats();

      // 更新缓存
      this.cache.setEC2(this.environment, ec2Stats);

      this.render();
    } catch (error: any) {
      this.showError(error.message);
    }
  }

  render(): void {
    const ec2Stats = this.cache.getEC2(this.environment);

    if (!ec2Stats || ec2Stats.length === 0) {
      this.showEmpty('无 EC2 数据');
      return;
    }

    let content = '';

    for (const stat of ec2Stats) {
      const envLabels: Record<string, string> = {
        production: 'Production',
        stage: 'Stage',
        shared: 'Shared',
      };
      const envLabel = envLabels[stat.environment] || stat.environment;

      // 环境标题
      content += ` {cyan-fg}{bold}${envLabel}{/bold}{/cyan-fg}`;

      // 检查离线状态
      if (stat.offline) {
        content += ' {red-fg}[离线]{/red-fg}\\n';
        content += `   {gray-fg}${stat.error || 'SSH 连接超时，实例可能已关闭'}{/gray-fg}\\n\\n`;

        // 分隔线（不是最后一个环境时）
        if (ec2Stats.indexOf(stat) < ec2Stats.length - 1) {
          content += '   ' + '─'.repeat(70) + '\\n\\n';
        }
        continue;
      }

      // 检查其他错误
      if (stat.error) {
        content += ' {yellow-fg}[错误]{/yellow-fg}\\n';
        content += `   {gray-fg}${stat.error}{/gray-fg}\\n\\n`;

        // 分隔线（不是最后一个环境时）
        if (ec2Stats.indexOf(stat) < ec2Stats.length - 1) {
          content += '   ' + '─'.repeat(70) + '\\n\\n';
        }
        continue;
      }

      content += '\\n';

      // 实例信息
      content += `   {bold}实例类型{/bold}: ${stat.instanceType}\\n`;
      content += `   {bold}实例 ID{/bold}:  ${stat.instanceId}\\n`;
      content += `   {bold}运行时间{/bold}: ${stat.uptime}\\n`;
      content += '\\n';

      // 内存使用
      const memPercent =
        stat.memoryTotal > 0 ? ((stat.memoryUsed / stat.memoryTotal) * 100).toFixed(1) : '0';
      const memColor =
        parseFloat(memPercent) > 80 ? 'red' : parseFloat(memPercent) > 50 ? 'yellow' : 'green';

      content += `   {bold}内存使用{/bold}\\n`;
      content += `     {${memColor}-fg}${stat.memoryUsed} MB / ${stat.memoryTotal} MB (${memPercent}%){/${memColor}-fg}\\n`;

      // 进度条
      const memBarWidth = 50;
      const memFilled = Math.round((parseFloat(memPercent) / 100) * memBarWidth);
      const memBar = '█'.repeat(memFilled) + '░'.repeat(memBarWidth - memFilled);
      content += `     {${memColor}-fg}${memBar}{/${memColor}-fg}\\n`;
      content += '\\n';

      // 磁盘使用
      content += `   {bold}磁盘使用{/bold}\\n`;
      if (stat.disks && stat.disks.length > 0) {
        for (const disk of stat.disks) {
          const diskColor = disk.percent > 80 ? 'red' : disk.percent > 50 ? 'yellow' : 'green';
          const mountLabel = disk.mountPoint.padEnd(10);

          content += `     ${mountLabel} {${diskColor}-fg}${disk.used} GB / ${disk.total} GB (${disk.percent}%){/${diskColor}-fg}\\n`;

          // 进度条
          const diskBarWidth = 40;
          const diskFilled = Math.round((disk.percent / 100) * diskBarWidth);
          const diskBar = '█'.repeat(diskFilled) + '░'.repeat(diskBarWidth - diskFilled);
          content += `                {${diskColor}-fg}${diskBar}{/${diskColor}-fg}\\n`;
        }
      } else {
        // 向后兼容：显示旧格式
        const diskPercent =
          stat.diskTotal > 0 ? ((stat.diskUsed / stat.diskTotal) * 100).toFixed(1) : '0';
        const diskColor =
          parseFloat(diskPercent) > 80 ? 'red' : parseFloat(diskPercent) > 50 ? 'yellow' : 'green';

        content += `     / (root)   {${diskColor}-fg}${stat.diskUsed} GB / ${stat.diskTotal} GB (${diskPercent}%){/${diskColor}-fg}\\n`;
      }

      content += '\\n';

      // 告警信息
      const warnings: string[] = [];
      if (parseFloat(memPercent) > 80) {
        warnings.push(`内存使用过高 (${memPercent}%)`);
      }
      if (stat.disks) {
        const highDiskUsage = stat.disks.filter((d) => d.percent > 80);
        if (highDiskUsage.length > 0) {
          warnings.push(
            `磁盘使用过高: ${highDiskUsage.map((d) => `${d.mountPoint} (${d.percent}%)`).join(', ')}`
          );
        }
      }

      if (warnings.length > 0) {
        content += `   {red-fg}{bold}⚠ 告警{/bold}{/red-fg}\\n`;
        for (const warning of warnings) {
          content += `     {red-fg}• ${warning}{/red-fg}\\n`;
        }
        content += '\\n';
      }

      // 分隔线（不是最后一个环境时）
      if (ec2Stats.indexOf(stat) < ec2Stats.length - 1) {
        content += '   ' + '─'.repeat(70) + '\\n\\n';
      }
    }

    this.container.setContent(content);
    this.screen.render();
  }
}
