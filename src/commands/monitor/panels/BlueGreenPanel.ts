import blessed from 'neo-blessed';
import { BasePanel } from './BasePanel.js';
import { BlueGreenService } from '../../../services/monitor/BlueGreenService.js';
import type { BlueGreenDeployment, TargetGroupInfo } from '../../../types/monitor.js';

/**
 * Blue-Green Deployment Panel (Panel 4)
 *
 * 显示蓝绿部署详细信息：
 * - 每个服务的 Blue/Green Target Group 状态
 * - 实例健康状态（Healthy/Unhealthy/Draining）
 * - 流量权重分配
 * - 部署模式（Blue-Only/Green-Only/Canary/Split）
 * - 可视化流量分配条
 */
export class BlueGreenPanel extends BasePanel {
  private blueGreenService: BlueGreenService;

  constructor(
    screen: blessed.Widgets.Screen,
    config: any,
    cache: any,
    environment: string
  ) {
    super(screen, config, cache, environment);
    this.blueGreenService = new BlueGreenService(environment);
  }

  async refresh(): Promise<void> {
    this.showLoading('刷新蓝绿部署数据...');

    try {
      const deployments = await this.blueGreenService.getBlueGreenDeployments();

      // 更新缓存
      this.cache.setBlueGreen(this.environment, deployments);

      this.render();
    } catch (error: any) {
      this.showError(error.message);
    }
  }

  render(): void {
    const deployments = this.cache.getBlueGreen(this.environment);

    if (!deployments || deployments.length === 0) {
      this.showEmpty('无蓝绿部署服务');
      return;
    }

    let content = '';

    // 遍历每个蓝绿部署服务
    for (let i = 0; i < deployments.length; i++) {
      const bg = deployments[i];
      if (!bg) continue;

      // 服务标题
      content += ` {cyan-fg}{bold}${bg.service}{/bold}{/cyan-fg} (${bg.subdomain}.optima.shop)\\n`;

      // 部署状态
      const statusEmoji = this.getStatusEmoji(bg.status);
      const statusText = this.getStatusText(bg.status);
      content += `   状态: ${statusEmoji} ${statusText}\\n\\n`;

      // Blue Target Group
      content += `   {blue-fg}{bold}Blue{/bold}{/blue-fg} (${bg.blueTargetGroup.name})\\n`;
      content += this.renderTargetGroupInfo(bg.blueTargetGroup);
      content += '\\n';

      // Green Target Group
      content += `   {green-fg}{bold}Green{/bold}{/green-fg} (${bg.greenTargetGroup.name})\\n`;
      content += this.renderTargetGroupInfo(bg.greenTargetGroup);
      content += '\\n';

      // 流量分配可视化
      content += `   {bold}流量分配{/bold}\\n`;
      content += this.renderTrafficBar(bg.totalTraffic.blue, bg.totalTraffic.green);
      content += '\\n';

      // 分隔线（不是最后一个服务时）
      if (i < deployments.length - 1) {
        content += '   ' + '─'.repeat(70) + '\\n\\n';
      }
    }

    this.container.setContent(content);
    this.screen.render();
  }

  /**
   * 渲染 Target Group 信息
   */
  private renderTargetGroupInfo(tg: TargetGroupInfo): string {
    const total = tg.healthyCount + tg.unhealthyCount + tg.drainingCount;

    let info = '';
    info += `     端口: ${tg.port}\\n`;
    info += `     实例: `;

    if (tg.healthyCount > 0) {
      info += `{green-fg}✓ ${tg.healthyCount} 健康{/green-fg}  `;
    }
    if (tg.unhealthyCount > 0) {
      info += `{red-fg}✗ ${tg.unhealthyCount} 不健康{/red-fg}  `;
    }
    if (tg.drainingCount > 0) {
      info += `{yellow-fg}⟳ ${tg.drainingCount} 排空中{/yellow-fg}  `;
    }
    if (total === 0) {
      info += `{gray-fg}无注册实例{/gray-fg}`;
    }

    info += '\\n';
    info += `     权重: {bold}${tg.weight}%{/bold}\\n`;

    return info;
  }

  /**
   * 渲染流量分配可视化条
   */
  private renderTrafficBar(bluePercent: number, greenPercent: number): string {
    const barWidth = 60;
    const blueWidth = Math.round((barWidth * bluePercent) / 100);
    const greenWidth = barWidth - blueWidth;

    let bar = '     ';

    // Blue 部分
    if (blueWidth > 0) {
      bar += `{blue-bg}${' '.repeat(blueWidth)}{/blue-bg}`;
    }

    // Green 部分
    if (greenWidth > 0) {
      bar += `{green-bg}${' '.repeat(greenWidth)}{/green-bg}`;
    }

    bar += '\\n';
    bar += `     {blue-fg}Blue: ${bluePercent}%{/blue-fg}  {green-fg}Green: ${greenPercent}%{/green-fg}\\n`;

    return bar;
  }

  /**
   * 获取状态 Emoji
   */
  private getStatusEmoji(status: BlueGreenDeployment['status']): string {
    switch (status) {
      case 'blue-only':
        return '{blue-fg}●{/blue-fg}';
      case 'green-only':
        return '{green-fg}●{/green-fg}';
      case 'canary':
        return '{yellow-fg}◐{/yellow-fg}';
      case 'split':
        return '{magenta-fg}◑{/magenta-fg}';
      default:
        return '{gray-fg}◯{/gray-fg}';
    }
  }

  /**
   * 获取状态文本
   */
  private getStatusText(status: BlueGreenDeployment['status']): string {
    switch (status) {
      case 'blue-only':
        return '{blue-fg}100% Blue 环境{/blue-fg}';
      case 'green-only':
        return '{green-fg}100% Green 环境{/green-fg}';
      case 'canary':
        return '{yellow-fg}金丝雀部署（渐进式切换）{/yellow-fg}';
      case 'split':
        return '{magenta-fg}流量分割测试{/magenta-fg}';
      default:
        return '{gray-fg}未知状态{/gray-fg}';
    }
  }
}
