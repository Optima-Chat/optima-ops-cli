import {
  EC2Client,
  DescribeInstancesCommand,
} from '@aws-sdk/client-ec2';
import {
  CloudWatchClient,
  GetMetricDataCommand,
} from '@aws-sdk/client-cloudwatch';
import type { EC2Stats } from '../../types/monitor.js';

/**
 * EC2 实例配置
 */
interface EC2InstanceConfig {
  name: string;
  environment: 'production' | 'stage' | 'shared';
}

/**
 * EC2 监控服务
 *
 * 使用 CloudWatch 获取 EC2 实例的资源使用情况：
 * - CPU 使用率：AWS/EC2 CPUUtilization (免费)
 * - 网络流量：AWS/EC2 NetworkIn/NetworkOut (免费)
 * - 实例信息：EC2 API
 *
 * 注意：内存和磁盘指标需要 CloudWatch Agent（付费），
 * 这里只使用免费指标。
 *
 * 成本：$0/月（使用 CloudWatch 免费指标）
 */
export class EC2MonitorService {
  private ec2Client: EC2Client;
  private cloudwatchClient: CloudWatchClient;

  // 已知的 EC2 实例（按 Name tag 查找）
  private static readonly KNOWN_INSTANCES: EC2InstanceConfig[] = [
    { name: 'optima-prod-host', environment: 'production' },
    { name: 'optima-stage-host', environment: 'stage' },
    { name: 'optima-shared-host', environment: 'shared' },
  ];

  constructor(region: string = 'ap-southeast-1') {
    this.ec2Client = new EC2Client({ region });
    this.cloudwatchClient = new CloudWatchClient({ region });
  }

  /**
   * 获取所有 EC2 实例状态
   */
  async fetchAllInstances(): Promise<EC2Stats[]> {
    const results: EC2Stats[] = [];

    // 并行获取所有实例
    const promises = EC2MonitorService.KNOWN_INSTANCES.map(async (config) => {
      try {
        const stats = await this.fetchInstanceStats(config);
        if (stats) {
          results.push(stats);
        }
      } catch (error: any) {
        // 返回错误状态而不是跳过
        results.push({
          environment: config.environment,
          instanceId: 'unknown',
          instanceType: 'unknown',
          memoryUsed: 0,
          memoryTotal: 0,
          diskUsed: 0,
          diskTotal: 0,
          uptime: 'unknown',
          error: error.message,
          offline: true,
        });
      }
    });

    await Promise.all(promises);
    return results;
  }

  /**
   * 获取单个实例的状态
   */
  private async fetchInstanceStats(config: EC2InstanceConfig): Promise<EC2Stats | null> {
    // 1. 通过 Name tag 查找实例
    const instance = await this.findInstanceByName(config.name);
    if (!instance) {
      return {
        environment: config.environment,
        instanceId: 'not-found',
        instanceType: 'unknown',
        memoryUsed: 0,
        memoryTotal: 0,
        diskUsed: 0,
        diskTotal: 0,
        uptime: 'unknown',
        error: `Instance ${config.name} not found`,
        offline: true,
      };
    }

    const instanceId = instance.InstanceId || 'unknown';
    const instanceType = instance.InstanceType || 'unknown';

    // 2. 计算运行时间
    const launchTime = instance.LaunchTime;
    const uptime = launchTime ? this.formatUptime(launchTime) : 'unknown';

    // 3. 获取 CloudWatch 指标
    const metrics = await this.fetchCloudWatchMetrics(instanceId);

    // 4. 获取内存信息（从实例类型推断）
    const memoryInfo = this.getMemoryFromInstanceType(instanceType);

    return {
      environment: config.environment,
      instanceId,
      instanceType,
      cpuUsage: metrics.cpuUtilization,
      memoryUsed: 0, // CloudWatch Agent 才能获取，这里设为 0
      memoryTotal: memoryInfo.totalMB,
      diskUsed: 0, // CloudWatch Agent 才能获取
      diskTotal: 0,
      uptime,
      // 注意：免费 CloudWatch 指标不包含内存和磁盘
      // 如果需要这些指标，需要安装 CloudWatch Agent
    };
  }

  /**
   * 通过 Name tag 查找 EC2 实例
   */
  private async findInstanceByName(name: string): Promise<any | null> {
    try {
      const command = new DescribeInstancesCommand({
        Filters: [
          { Name: 'tag:Name', Values: [name] },
          { Name: 'instance-state-name', Values: ['running'] },
        ],
      });

      const response = await this.ec2Client.send(command);
      const reservations = response.Reservations || [];

      for (const reservation of reservations) {
        const instances = reservation.Instances || [];
        if (instances.length > 0) {
          return instances[0];
        }
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * 获取 CloudWatch 指标
   */
  private async fetchCloudWatchMetrics(
    instanceId: string
  ): Promise<{ cpuUtilization?: number; networkIn?: number; networkOut?: number }> {
    try {
      const endTime = new Date();
      const startTime = new Date(endTime.getTime() - 5 * 60 * 1000); // 最近 5 分钟

      const command = new GetMetricDataCommand({
        MetricDataQueries: [
          {
            Id: 'cpu',
            MetricStat: {
              Metric: {
                Namespace: 'AWS/EC2',
                MetricName: 'CPUUtilization',
                Dimensions: [
                  { Name: 'InstanceId', Value: instanceId },
                ],
              },
              Period: 60,
              Stat: 'Average',
            },
          },
          {
            Id: 'netIn',
            MetricStat: {
              Metric: {
                Namespace: 'AWS/EC2',
                MetricName: 'NetworkIn',
                Dimensions: [
                  { Name: 'InstanceId', Value: instanceId },
                ],
              },
              Period: 60,
              Stat: 'Average',
            },
          },
          {
            Id: 'netOut',
            MetricStat: {
              Metric: {
                Namespace: 'AWS/EC2',
                MetricName: 'NetworkOut',
                Dimensions: [
                  { Name: 'InstanceId', Value: instanceId },
                ],
              },
              Period: 60,
              Stat: 'Average',
            },
          },
        ],
        StartTime: startTime,
        EndTime: endTime,
      });

      const response = await this.cloudwatchClient.send(command);
      const results = response.MetricDataResults || [];

      const cpuResult = results.find(r => r.Id === 'cpu');
      const netInResult = results.find(r => r.Id === 'netIn');
      const netOutResult = results.find(r => r.Id === 'netOut');

      return {
        cpuUtilization: cpuResult?.Values?.[0],
        networkIn: netInResult?.Values?.[0],
        networkOut: netOutResult?.Values?.[0],
      };
    } catch (error) {
      return {};
    }
  }

  /**
   * 从实例类型推断内存大小
   */
  private getMemoryFromInstanceType(instanceType: string): { totalMB: number } {
    // 常见实例类型的内存映射
    const memoryMap: Record<string, number> = {
      't3.micro': 1024,
      't3.small': 2048,
      't3.medium': 4096,
      't3.large': 8192,
      't3.xlarge': 16384,
      't3.2xlarge': 32768,
      't2.micro': 1024,
      't2.small': 2048,
      't2.medium': 4096,
      't2.large': 8192,
      'm5.large': 8192,
      'm5.xlarge': 16384,
      'm5.2xlarge': 32768,
      'c5.large': 4096,
      'c5.xlarge': 8192,
      'r5.large': 16384,
      'r5.xlarge': 32768,
    };

    return {
      totalMB: memoryMap[instanceType] || 0,
    };
  }

  /**
   * 格式化运行时间
   */
  private formatUptime(launchTime: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - launchTime.getTime();

    const seconds = Math.floor(diffMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days}d ${hours % 24}h`;
    } else if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m`;
    } else {
      return `${seconds}s`;
    }
  }
}
