import { BasePanel } from './BasePanel.js';
import type { ECSServiceStats } from '../../../types/monitor.js';

/**
 * ECS Panel (Panel 2)
 *
 * 显示 ECS 服务状态：
 * - 服务列表（服务名、任务数）
 * - CPU/内存使用率（CloudWatch）
 * - 部署状态
 */
export class ECSPanel extends BasePanel {
  constructor(screen: any, config: any, cache: any, environment: string) {
    super(screen, config, cache, environment);
  }

  /**
   * 渲染 ECS 服务列表
   */
  render(): void {
    // 从缓存获取 ECS 数据
    const ecsServices = this.cache.get<ECSServiceStats[]>(`ecs:${this.environment}`);

    if (!ecsServices || ecsServices.length === 0) {
      this.container.setContent(' {yellow-fg}加载 ECS 服务数据...{/yellow-fg}');
      this.screen.render();
      return;
    }

    let content = '';

    // 标题
    content += ' {cyan-fg}{bold}ECS 服务状态{/bold}{/cyan-fg}\n\n';

    // 表头
    content += ' {bold}服务名                    任务数       CPU      内存     状态{/bold}\n';
    content += ' {gray-fg}─────────────────────────────────────────────────────────────────{/gray-fg}\n';

    // 按服务名排序
    const sortedServices = [...ecsServices].sort((a, b) =>
      a.serviceName.localeCompare(b.serviceName)
    );

    sortedServices.forEach(service => {
      // 服务名（截断显示）
      const name = service.serviceName.substring(0, 22).padEnd(22);

      // 任务数
      const taskStatus = `${service.runningCount}/${service.desiredCount}`;
      const taskColor = service.runningCount === service.desiredCount
        ? 'green'
        : service.runningCount > 0 ? 'yellow' : 'red';
      const taskDisplay = `{${taskColor}-fg}${taskStatus.padEnd(10)}{/${taskColor}-fg}`;

      // CPU 使用率
      let cpuDisplay: string;
      if (service.cpuUtilization !== undefined) {
        const cpuValue = service.cpuUtilization.toFixed(1);
        const cpuColor = service.cpuUtilization > 80 ? 'red'
          : service.cpuUtilization > 50 ? 'yellow' : 'green';
        cpuDisplay = `{${cpuColor}-fg}${cpuValue.padStart(5)}%{/${cpuColor}-fg}`;
      } else {
        cpuDisplay = '{gray-fg}  N/A{/gray-fg}';
      }

      // 内存使用率
      let memDisplay: string;
      if (service.memoryUtilization !== undefined) {
        const memValue = service.memoryUtilization.toFixed(1);
        const memColor = service.memoryUtilization > 80 ? 'red'
          : service.memoryUtilization > 50 ? 'yellow' : 'green';
        memDisplay = `{${memColor}-fg}${memValue.padStart(5)}%{/${memColor}-fg}`;
      } else {
        memDisplay = '{gray-fg}  N/A{/gray-fg}';
      }

      // 部署状态
      let statusDisplay: string;
      switch (service.deploymentStatus) {
        case 'stable':
          statusDisplay = '{green-fg}稳定{/green-fg}';
          break;
        case 'deploying':
          statusDisplay = '{yellow-fg}部署中{/yellow-fg}';
          break;
        case 'scaling-down':
          statusDisplay = '{cyan-fg}缩容{/cyan-fg}';
          break;
        default:
          statusDisplay = '{gray-fg}未知{/gray-fg}';
      }

      content += ` ${name} ${taskDisplay}  ${cpuDisplay}   ${memDisplay}   ${statusDisplay}\n`;
    });

    // 摘要
    content += '\n';
    content += ` {gray-fg}总计: ${ecsServices.length} 个服务{/gray-fg}\n`;

    const running = ecsServices.filter(s => s.runningCount > 0).length;
    const healthy = ecsServices.filter(s => s.runningCount === s.desiredCount).length;
    content += ` {gray-fg}运行中: ${running} | 健康: ${healthy}{/gray-fg}\n`;

    // 最后刷新时间
    const cacheAge = this.cache.getAge(`ecs:${this.environment}`);
    if (cacheAge !== null) {
      const ageSeconds = Math.floor(cacheAge / 1000);
      content += `\n {gray-fg}数据更新于 ${ageSeconds}s 前{/gray-fg}`;
    }

    this.container.setContent(content);
    this.screen.render();
  }

  /**
   * 手动刷新（按 'r' 键时调用）
   */
  async refresh(): Promise<void> {
    // 数据刷新由 PanelManager 统一管理
    // 这里只重新渲染视图
    this.render();
  }
}
