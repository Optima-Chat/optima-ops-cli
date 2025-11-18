import {
  ECSClient,
  DescribeServicesCommand,
  ListTasksCommand,
  DescribeTasksCommand,
} from '@aws-sdk/client-ecs';

export interface ECSTaskInfo {
  desired: number;
  running: number;
  pending: number;
  healthy: number;
}

export class ECSService {
  private client: ECSClient;

  constructor(region: string = 'ap-southeast-1') {
    this.client = new ECSClient({ region });
  }

  /**
   * 获取服务任务数
   */
  async getServiceTasks(
    cluster: string,
    serviceName: string,
  ): Promise<ECSTaskInfo> {
    try {
      const command = new DescribeServicesCommand({
        cluster,
        services: [serviceName],
      });

      const response = await this.client.send(command);

      if (!response.services || response.services.length === 0) {
        return {
          desired: 0,
          running: 0,
          pending: 0,
          healthy: 0,
        };
      }

      const service = response.services[0];

      return {
        desired: service.desiredCount ?? 0,
        running: service.runningCount ?? 0,
        pending: service.pendingCount ?? 0,
        // 简化版：假设 running = healthy（完整实现需要查询 ALB target health）
        healthy: service.runningCount ?? 0,
      };
    } catch (error) {
      const err = error as Error;
      throw new Error(
        `Failed to get ECS tasks for ${serviceName}: ${err.message}`,
      );
    }
  }

  /**
   * 列出服务的所有任务
   */
  async listServiceTasks(
    cluster: string,
    serviceName: string,
  ): Promise<string[]> {
    try {
      const command = new ListTasksCommand({
        cluster,
        serviceName,
      });

      const response = await this.client.send(command);
      return response.taskArns ?? [];
    } catch (error) {
      const err = error as Error;
      throw new Error(
        `Failed to list tasks for ${serviceName}: ${err.message}`,
      );
    }
  }

  /**
   * 描述任务详情
   */
  async describeTasks(cluster: string, taskArns: string[]) {
    if (taskArns.length === 0) {
      return [];
    }

    try {
      const command = new DescribeTasksCommand({
        cluster,
        tasks: taskArns,
      });

      const response = await this.client.send(command);
      return response.tasks ?? [];
    } catch (error) {
      const err = error as Error;
      throw new Error(`Failed to describe tasks: ${err.message}`);
    }
  }
}
