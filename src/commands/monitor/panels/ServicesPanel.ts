import { BasePanel } from './BasePanel.js';
import { MonitorDataService } from '../../../services/monitor/MonitorDataService.js';
import type { ServiceHealth } from '../../../types/monitor.js';

/**
 * Services Health Panel (Panel 1)
 *
 * 显示所有服务的详细健康状态：
 * - 核心服务（Core Services）
 * - MCP 工具服务（MCP Tools）
 * - 每个服务的 Prod 和 Stage 环境状态
 * - 响应时间
 * - 容器状态
 */
export class ServicesPanel extends BasePanel {
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
    const services = this.cache.getServices(this.environment);

    if (!services || services.length === 0) {
      this.showLoading('加载服务数据...');
      return;
    }

    const coreServices = services.filter((s) => s.type === 'core');
    const mcpServices = services.filter((s) => s.type === 'mcp');

    let content = '';

    // === 核心服务 ===
    content += ` {cyan-fg}{bold}核心服务{/bold}{/cyan-fg} (${coreServices.length})\n`;
    content += ' {bold}服务               Prod          Stage{/bold}\n';

    for (const svc of coreServices) {
      const name = svc.name.padEnd(18);

      // Prod 状态
      const prodIcon = this.getHealthIcon(svc.prod.health);
      const prodTime = svc.prod.responseTime > 0 ? `${svc.prod.responseTime}ms` : '-';
      const prodUptime = svc.prod.uptime || '-';
      const prodDisplay = `${prodIcon} ${prodTime.padEnd(6)} ${prodUptime.padEnd(10)}`;

      // Stage 状态
      let stageDisplay = '';
      if (svc.stage) {
        const stageIcon = this.getHealthIcon(svc.stage.health);
        const stageTime = svc.stage.responseTime > 0 ? `${svc.stage.responseTime}ms` : '-';
        const stageUptime = svc.stage.uptime || '-';
        stageDisplay = `${stageIcon} ${stageTime.padEnd(6)} ${stageUptime.padEnd(10)}`;
      } else {
        stageDisplay = '{gray-fg}-{/gray-fg}';
      }

      content += ` ${name} ${prodDisplay}  ${stageDisplay}\n`;

      // 显示错误信息
      if (svc.prod.health === 'unhealthy' && svc.prod.error) {
        content += `   {red-fg}→ Prod: ${svc.prod.error}{/red-fg}\n`;
      }
      if (svc.stage && svc.stage.health === 'unhealthy' && svc.stage.error) {
        content += `   {red-fg}→ Stage: ${svc.stage.error}{/red-fg}\n`;
      }
    }

    content += '\n';

    // === MCP 工具服务 ===
    content += ` {cyan-fg}{bold}MCP 工具{/bold}{/cyan-fg} (${mcpServices.length})\n`;
    content += ' {bold}服务               Prod          Stage{/bold}\n';

    for (const svc of mcpServices) {
      const name = svc.name.padEnd(18);

      // Prod 状态
      const prodIcon = this.getHealthIcon(svc.prod.health);
      const prodTime = svc.prod.responseTime > 0 ? `${svc.prod.responseTime}ms` : '-';
      const prodUptime = svc.prod.uptime || '-';
      const prodDisplay = `${prodIcon} ${prodTime.padEnd(6)} ${prodUptime.padEnd(10)}`;

      // Stage 状态
      let stageDisplay = '';
      if (svc.stage) {
        const stageIcon = this.getHealthIcon(svc.stage.health);
        const stageTime = svc.stage.responseTime > 0 ? `${svc.stage.responseTime}ms` : '-';
        const stageUptime = svc.stage.uptime || '-';
        stageDisplay = `${stageIcon} ${stageTime.padEnd(6)} ${stageUptime.padEnd(10)}`;
      } else {
        stageDisplay = '{gray-fg}-{/gray-fg}';
      }

      content += ` ${name} ${prodDisplay}  ${stageDisplay}\n`;

      // 显示错误信息
      if (svc.prod.health === 'unhealthy' && svc.prod.error) {
        content += `   {red-fg}→ Prod: ${svc.prod.error}{/red-fg}\n`;
      }
      if (svc.stage && svc.stage.health === 'unhealthy' && svc.stage.error) {
        content += `   {red-fg}→ Stage: ${svc.stage.error}{/red-fg}\n`;
      }
    }

    content += '\n';

    // === 统计信息 ===
    const totalServices = services.length;
    const healthyCount = services.filter((s) => s.prod.health === 'healthy').length;
    const degradedCount = services.filter((s) => s.prod.health === 'degraded').length;
    const unhealthyCount = services.filter((s) => s.prod.health === 'unhealthy').length;

    content += ' {bold}统计{/bold}\n';
    content += `   总计: ${totalServices} 个服务\n`;
    content += `   {green-fg}✓ 健康: ${healthyCount}{/green-fg}  `;
    content += `{yellow-fg}⚠ 降级: ${degradedCount}{/yellow-fg}  `;
    content += `{red-fg}✗ 不健康: ${unhealthyCount}{/red-fg}\n`;

    this.container.setContent(content);
    this.screen.render();
  }

  /**
   * 获取健康状态图标
   */
  private getHealthIcon(health: 'healthy' | 'degraded' | 'unhealthy'): string {
    if (health === 'healthy') {
      return '{green-fg}✓{/green-fg}';
    } else if (health === 'degraded') {
      return '{yellow-fg}⚠{/yellow-fg}';
    } else {
      return '{red-fg}✗{/red-fg}';
    }
  }
}
