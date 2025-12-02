import {
  ECSClient,
  ListServicesCommand,
  DescribeServicesCommand,
} from '@aws-sdk/client-ecs';
import {
  CloudWatchClient,
  GetMetricDataCommand,
} from '@aws-sdk/client-cloudwatch';
import type { ECSServiceStats } from '../../types/monitor.js';

/**
 * ECS 监控服务
 *
 * 使用 CloudWatch 获取 ECS 服务的资源使用情况：
 * - CPU 使用率：AWS/ECS CPUUtilization
 * - 内存使用率：AWS/ECS MemoryUtilization
 * - 服务状态：ECS API
 *
 * 成本：$0/月（使用 CloudWatch 免费指标）
 */
export class ECSMonitorService {
  private ecsClient: ECSClient;
  private cloudwatchClient: CloudWatchClient;
  private clusterName: string;

  constructor(clusterName: string = 'optima-cluster', region: string = 'ap-southeast-1') {
    this.clusterName = clusterName;
    this.ecsClient = new ECSClient({ region });
    this.cloudwatchClient = new CloudWatchClient({ region });
  }

  /**
   * 获取所有 ECS 服务状态
   */
  async fetchAllServices(): Promise<ECSServiceStats[]> {
    try {
      // 1. 列出所有服务
      const listCommand = new ListServicesCommand({
        cluster: this.clusterName,
        maxResults: 100,
      });
      const listResponse = await this.ecsClient.send(listCommand);
      const serviceArns = listResponse.serviceArns || [];

      if (serviceArns.length === 0) {
        return [];
      }

      // 2. 获取服务详情
      const describeCommand = new DescribeServicesCommand({
        cluster: this.clusterName,
        services: serviceArns,
      });
      const describeResponse = await this.ecsClient.send(describeCommand);
      const services = describeResponse.services || [];

      // 3. 获取 CloudWatch 指标
      const serviceNames = services.map(s => s.serviceName || '').filter(Boolean);
      const metrics = await this.fetchCloudWatchMetrics(serviceNames);

      // 4. 合并数据
      return services.map(service => {
        const serviceName = service.serviceName || 'unknown';
        const metricsData = metrics.get(serviceName) || { cpu: undefined, memory: undefined };

        return {
          serviceName,
          clusterName: this.clusterName,
          runningCount: service.runningCount || 0,
          desiredCount: service.desiredCount || 0,
          pendingCount: service.pendingCount || 0,
          cpuUtilization: metricsData.cpu,
          memoryUtilization: metricsData.memory,
          status: (service.status as 'ACTIVE' | 'DRAINING' | 'INACTIVE') || 'INACTIVE',
          deploymentStatus: this.getDeploymentStatus(service),
          lastDeployment: this.getLastDeploymentTime(service),
        };
      });
    } catch (error: any) {
      throw new Error(`Failed to fetch ECS services: ${error.message}`);
    }
  }

  /**
   * 获取 CloudWatch 指标（批量）
   */
  private async fetchCloudWatchMetrics(
    serviceNames: string[]
  ): Promise<Map<string, { cpu?: number; memory?: number }>> {
    const result = new Map<string, { cpu?: number; memory?: number }>();

    if (serviceNames.length === 0) {
      return result;
    }

    try {
      const endTime = new Date();
      const startTime = new Date(endTime.getTime() - 5 * 60 * 1000); // 最近 5 分钟

      // 构建 MetricDataQueries
      const queries = serviceNames.flatMap((serviceName, index) => [
        {
          Id: `cpu_${index}`,
          MetricStat: {
            Metric: {
              Namespace: 'AWS/ECS',
              MetricName: 'CPUUtilization',
              Dimensions: [
                { Name: 'ClusterName', Value: this.clusterName },
                { Name: 'ServiceName', Value: serviceName },
              ],
            },
            Period: 60,
            Stat: 'Average',
          },
          Label: `${serviceName}_cpu`,
        },
        {
          Id: `mem_${index}`,
          MetricStat: {
            Metric: {
              Namespace: 'AWS/ECS',
              MetricName: 'MemoryUtilization',
              Dimensions: [
                { Name: 'ClusterName', Value: this.clusterName },
                { Name: 'ServiceName', Value: serviceName },
              ],
            },
            Period: 60,
            Stat: 'Average',
          },
          Label: `${serviceName}_memory`,
        },
      ]);

      const command = new GetMetricDataCommand({
        MetricDataQueries: queries,
        StartTime: startTime,
        EndTime: endTime,
      });

      const response = await this.cloudwatchClient.send(command);
      const metricResults = response.MetricDataResults || [];

      // 解析结果
      serviceNames.forEach((serviceName, index) => {
        const cpuResult = metricResults.find(r => r.Id === `cpu_${index}`);
        const memResult = metricResults.find(r => r.Id === `mem_${index}`);

        const cpuValues = cpuResult?.Values || [];
        const memValues = memResult?.Values || [];

        result.set(serviceName, {
          cpu: cpuValues.length > 0 ? cpuValues[0] : undefined,
          memory: memValues.length > 0 ? memValues[0] : undefined,
        });
      });
    } catch (error: any) {
      // CloudWatch 错误不应阻止返回基本服务信息
      console.error(`CloudWatch metrics fetch failed: ${error.message}`);
    }

    return result;
  }

  /**
   * 获取部署状态描述
   */
  private getDeploymentStatus(service: any): string {
    const deployments = service.deployments || [];
    if (deployments.length === 0) {
      return 'unknown';
    }

    const primary = deployments.find((d: any) => d.status === 'PRIMARY');
    if (!primary) {
      return 'unknown';
    }

    if (primary.runningCount === primary.desiredCount) {
      return 'stable';
    } else if (primary.runningCount < primary.desiredCount) {
      return 'deploying';
    } else {
      return 'scaling-down';
    }
  }

  /**
   * 获取最后部署时间
   */
  private getLastDeploymentTime(service: any): Date | undefined {
    const deployments = service.deployments || [];
    const primary = deployments.find((d: any) => d.status === 'PRIMARY');

    if (primary?.createdAt) {
      return new Date(primary.createdAt);
    }

    return undefined;
  }

  /**
   * 获取单个服务的详细状态
   */
  async fetchServiceDetails(serviceName: string): Promise<ECSServiceStats | null> {
    try {
      const services = await this.fetchAllServices();
      return services.find(s => s.serviceName === serviceName) || null;
    } catch (error) {
      return null;
    }
  }
}
