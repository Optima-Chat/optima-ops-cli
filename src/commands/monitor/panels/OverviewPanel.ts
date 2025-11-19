import { BasePanel } from './BasePanel.js';
import { MonitorDataService } from '../../../services/monitor/MonitorDataService.js';
import { BlueGreenService } from '../../../services/monitor/BlueGreenService.js';

/**
 * Overview Panel (Panel 0)
 *
 * 显示系统整体健康状态的简洁概览：
 * - 服务健康汇总（健康/降级/不健康数量）
 * - EC2 资源使用概览（CPU/内存/磁盘）
 * - Docker 容器概览（运行数量/资源告警）
 * - 蓝绿部署状态概览（当前流量分配）
 */
export class OverviewPanel extends BasePanel {
  private dataService: MonitorDataService;
  private blueGreenService: BlueGreenService;

  constructor(
    screen: any,
    config: any,
    cache: any,
    environment: string
  ) {
    super(screen, config, cache, environment);
    this.dataService = new MonitorDataService(environment);
    this.blueGreenService = new BlueGreenService(environment);
  }

  async refresh(): Promise<void> {
    this.showLoading('刷新概览数据...');

    try {
      // 并行获取所有数据（首次加载或刷新）
      const [services, ec2, docker, blueGreen] = await Promise.all([
        this.fetchOrGetServices(),
        this.fetchOrGetEC2(),
        this.fetchOrGetDocker(),
        this.fetchOrGetBlueGreen(),
      ]);

      // 更新缓存
      if (services) this.cache.setServices(this.environment, services);
      if (ec2) this.cache.setEC2(this.environment, ec2);
      if (docker) this.cache.setDocker(this.environment, docker);
      if (blueGreen) this.cache.setBlueGreen(this.environment, blueGreen);

      this.render();
    } catch (error: any) {
      this.showError(error.message);
    }
  }

  private async fetchOrGetServices() {
    // 如果缓存有效，直接返回缓存
    if (this.cache.isValid(`services:${this.environment}`)) {
      return this.cache.getServices(this.environment);
    }
    // 否则获取新数据
    return await this.dataService.fetchServicesHealth();
  }

  private async fetchOrGetEC2() {
    if (this.cache.isValid(`ec2:${this.environment}`)) {
      return this.cache.getEC2(this.environment);
    }
    return await this.dataService.fetchEC2Stats();
  }

  private async fetchOrGetDocker() {
    if (this.cache.isValid(`docker:${this.environment}`)) {
      return this.cache.getDocker(this.environment);
    }
    return await this.dataService.fetchDockerStats();
  }

  private async fetchOrGetBlueGreen() {
    if (this.cache.isValid(`bluegreen:${this.environment}`)) {
      return this.cache.getBlueGreen(this.environment);
    }
    try {
      return await this.blueGreenService.getBlueGreenDeployments();
    } catch {
      return [];
    }
  }

  render(): void {
    const services = this.cache.getServices(this.environment);
    const ec2 = this.cache.getEC2(this.environment);
    const docker = this.cache.getDocker(this.environment);
    const blueGreen = this.cache.getBlueGreen(this.environment);

    let content = '';

    // === 服务健康概览 ===
    content += ' {cyan-fg}{bold}服务健康{/bold}{/cyan-fg}\\n';
    if (services && services.length > 0) {
      const healthy = services.filter((s) => s.prod.health === 'healthy').length;
      const degraded = services.filter((s) => s.prod.health === 'degraded').length;
      const unhealthy = services.filter((s) => s.prod.health === 'unhealthy').length;

      content += `   总计: ${services.length} 个服务\\n`;
      content += `   {green-fg}健康: ${healthy}{/green-fg}  `;
      content += `{yellow-fg}降级: ${degraded}{/yellow-fg}  `;
      content += `{red-fg}不健康: ${unhealthy}{/red-fg}\\n`;

      // 显示不健康的服务
      if (unhealthy > 0) {
        const unhealthyServices = services.filter((s) => s.prod.health === 'unhealthy');
        content += `   {red-fg}⚠ 不健康服务: ${unhealthyServices.map((s) => s.name).join(', ')}{/red-fg}\\n`;
      }
    } else {
      content += '   {yellow-fg}加载中...{/yellow-fg}\\n';
    }

    content += '\\n';

    // === EC2 资源概览 ===
    content += ' {cyan-fg}{bold}EC2 资源{/bold}{/cyan-fg}\\n';
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
          content += `   {bold}${envLabel}{/bold} {red-fg}[离线]{/red-fg}\\n`;
          content += `     {gray-fg}${stat.error || 'SSH 连接超时'}{/gray-fg}\\n`;
          continue;
        }

        // 检查其他错误
        if (stat.error) {
          content += `   {bold}${envLabel}{/bold} {yellow-fg}[错误]{/yellow-fg}\\n`;
          content += `     {gray-fg}${stat.error}{/gray-fg}\\n`;
          continue;
        }

        // 内存使用率
        const memPercent = stat.memoryTotal > 0 ? ((stat.memoryUsed / stat.memoryTotal) * 100).toFixed(0) : '0';
        const memColor = parseInt(memPercent) > 80 ? 'red' : parseInt(memPercent) > 50 ? 'yellow' : 'green';

        content += `   {bold}${envLabel}{/bold}\\n`;
        content += `     内存: {${memColor}-fg}${memPercent}%{/${memColor}-fg} (${stat.memoryUsed}MB / ${stat.memoryTotal}MB)\\n`;

        // 磁盘使用（只显示最高的）
        if (stat.disks && stat.disks.length > 0) {
          const maxDisk = stat.disks.reduce((max, disk) => (disk.percent > max.percent ? disk : max));
          const diskColor = maxDisk.percent > 80 ? 'red' : maxDisk.percent > 50 ? 'yellow' : 'green';
          content += `     磁盘: {${diskColor}-fg}${maxDisk.percent}%{/${diskColor}-fg} (${maxDisk.mountPoint})\\n`;
        }
      }
    } else {
      content += '   {yellow-fg}加载中...{/yellow-fg}\\n';
    }

    content += '\\n';

    // === Docker 容器概览 ===
    content += ' {cyan-fg}{bold}Docker 容器{/bold}{/cyan-fg}\\n';
    if (docker && docker.length > 0) {
      let totalContainers = 0;
      let highCpuCount = 0;
      let highMemCount = 0;
      let offlineEnvs: string[] = [];

      for (const envData of docker) {
        // 检查离线环境
        if (envData.offline) {
          const envLabels: Record<string, string> = {
            production: 'Production',
            stage: 'Stage',
            shared: 'Shared',
          };
          offlineEnvs.push(envLabels[envData.environment] || envData.environment);
          continue;
        }

        totalContainers += envData.stats.length;
        for (const stat of envData.stats) {
          if (stat.cpuPercent > 80) highCpuCount++;
          if (stat.memoryTotal > 0 && (stat.memoryUsed / stat.memoryTotal) * 100 > 80) highMemCount++;
        }
      }

      content += `   总计: ${totalContainers} 个容器\\n`;
      if (highCpuCount > 0) {
        content += `   {red-fg}⚠ CPU 高负载: ${highCpuCount} 个容器{/red-fg}\\n`;
      }
      if (highMemCount > 0) {
        content += `   {red-fg}⚠ 内存高使用: ${highMemCount} 个容器{/red-fg}\\n`;
      }
      if (offlineEnvs.length > 0) {
        content += `   {red-fg}⚠ 离线环境: ${offlineEnvs.join(', ')}{/red-fg}\\n`;
      }
      if (highCpuCount === 0 && highMemCount === 0 && offlineEnvs.length === 0) {
        content += `   {green-fg}✓ 所有容器资源正常{/green-fg}\\n`;
      }
    } else {
      content += '   {yellow-fg}加载中...{/yellow-fg}\\n';
    }

    content += '\\n';

    // === 蓝绿部署概览 ===
    content += ' {cyan-fg}{bold}蓝绿部署{/bold}{/cyan-fg}\\n';
    if (blueGreen && blueGreen.length > 0) {
      content += `   活跃服务: ${blueGreen.length}\\n`;
      for (const bg of blueGreen) {
        const blueTraffic = bg.totalTraffic.blue;
        const greenTraffic = bg.totalTraffic.green;

        let statusText = '';
        if (blueTraffic === 100 && greenTraffic === 0) {
          statusText = '{blue-fg}100% Blue{/blue-fg}';
        } else if (blueTraffic === 0 && greenTraffic === 100) {
          statusText = '{green-fg}100% Green{/green-fg}';
        } else {
          statusText = `{yellow-fg}Blue ${blueTraffic}% / Green ${greenTraffic}%{/yellow-fg}`;
        }

        content += `   ${bg.service.padEnd(20)} ${statusText}\\n`;
      }
    } else {
      content += '   {gray-fg}无蓝绿部署服务{/gray-fg}\\n';
    }

    content += '\\n';

    // === 提示信息 ===
    content += ' {gray-fg}提示: 按 [1-4] 查看详细信息{/gray-fg}\\n';

    this.container.setContent(content);
    this.screen.render();
  }
}
