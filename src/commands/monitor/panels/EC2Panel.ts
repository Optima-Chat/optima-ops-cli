import { BasePanel } from './BasePanel.js';

/**
 * EC2 Resources Panel (Panel 3)
 *
 * 显示 EC2 实例资源使用详情（使用 CloudWatch 免费指标）：
 * - 实例信息（ID、类型、运行时间）
 * - CPU 使用率（CloudWatch 免费指标）
 * - 内存信息（从实例类型推断总量，无实时使用数据）
 *
 * 注意：内存使用率和磁盘使用需要安装 CloudWatch Agent（付费），
 * 这里只使用免费指标。
 */
export class EC2Panel extends BasePanel {
  constructor(
    screen: any,
    config: any,
    cache: any,
    environment: string
  ) {
    super(screen, config, cache, environment);
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
    const ec2Stats = this.cache.getEC2(this.environment);

    if (!ec2Stats || ec2Stats.length === 0) {
      this.showLoading('加载 EC2 数据...');
      return;
    }

    let content = '';

    // 标题和说明
    content += ' {cyan-fg}{bold}EC2 实例状态{/bold}{/cyan-fg} {gray-fg}(CloudWatch 免费指标){/gray-fg}\n\n';

    for (const stat of ec2Stats) {
      const envLabels: Record<string, string> = {
        production: 'Production',
        stage: 'Stage',
        shared: 'Shared',
      };
      const envLabel = envLabels[stat.environment] || stat.environment;

      // 环境标题
      content += ` {bold}${envLabel}{/bold}`;

      // 检查离线状态
      if (stat.offline) {
        content += ' {red-fg}[离线]{/red-fg}\n';
        content += `   {gray-fg}${stat.error || '实例未找到或已停止'}{/gray-fg}\n\n`;
        continue;
      }

      // 检查其他错误
      if (stat.error) {
        content += ' {yellow-fg}[错误]{/yellow-fg}\n';
        content += `   {gray-fg}${stat.error}{/gray-fg}\n\n`;
        continue;
      }

      content += '\n';

      // 实例信息
      content += `   {bold}实例类型{/bold}: ${stat.instanceType}\n`;
      content += `   {bold}实例 ID{/bold}:  ${stat.instanceId}\n`;
      content += `   {bold}运行时间{/bold}: ${stat.uptime}\n`;
      content += '\n';

      // CPU 使用率（CloudWatch 免费指标）
      if (stat.cpuUsage !== undefined) {
        const cpuPercent = stat.cpuUsage.toFixed(1);
        const cpuColor = stat.cpuUsage > 80 ? 'red' : stat.cpuUsage > 50 ? 'yellow' : 'green';

        content += `   {bold}CPU 使用率{/bold}\n`;
        content += `     {${cpuColor}-fg}${cpuPercent}%{/${cpuColor}-fg}\n`;

        // 进度条
        const cpuBarWidth = 50;
        const cpuFilled = Math.round((stat.cpuUsage / 100) * cpuBarWidth);
        const cpuBar = '█'.repeat(cpuFilled) + '░'.repeat(cpuBarWidth - cpuFilled);
        content += `     {${cpuColor}-fg}${cpuBar}{/${cpuColor}-fg}\n`;
        content += '\n';

        // CPU 告警
        if (stat.cpuUsage > 80) {
          content += `   {red-fg}⚠ CPU 使用率过高 (${cpuPercent}%){/red-fg}\n\n`;
        }
      } else {
        content += `   {bold}CPU 使用率{/bold}\n`;
        content += `     {gray-fg}数据获取中...{/gray-fg}\n\n`;
      }

      // 内存信息（从实例类型推断）
      if (stat.memoryTotal > 0) {
        content += `   {bold}内存配置{/bold}\n`;
        const memGB = (stat.memoryTotal / 1024).toFixed(1);
        content += `     总内存: ${memGB} GB\n`;
        content += `     {gray-fg}(需要 CloudWatch Agent 获取使用率){/gray-fg}\n\n`;
      }

      // 分隔线（不是最后一个环境时）
      if (ec2Stats.indexOf(stat) < ec2Stats.length - 1) {
        content += '   ' + '─'.repeat(60) + '\n\n';
      }
    }

    // 底部说明
    content += '\n {gray-fg}提示: 内存使用率和磁盘使用需要安装 CloudWatch Agent{/gray-fg}\n';

    this.container.setContent(content);
    this.screen.render();
  }
}
