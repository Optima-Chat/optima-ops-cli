import {
  ElasticLoadBalancingV2Client,
  DescribeTargetGroupsCommand,
  DescribeTargetHealthCommand,
  DescribeRulesCommand,
  DescribeListenersCommand,
  type TargetGroup,
  type TargetHealthDescription,
  type Rule,
} from '@aws-sdk/client-elastic-load-balancing-v2';
import type { BlueGreenDeployment, TargetGroupInfo } from '../../types/monitor.js';

/**
 * 蓝绿部署服务
 *
 * 从 AWS ALB 获取蓝绿部署信息：
 * - Target Group 健康状态
 * - 流量权重分配
 * - 部署状态判断
 */
export class BlueGreenService {
  private client: ElasticLoadBalancingV2Client;
  private environment: string;

  constructor(environment: string = 'production') {
    this.environment = environment;
    this.client = new ElasticLoadBalancingV2Client({
      region: process.env.AWS_REGION || 'ap-southeast-1',
    });
  }

  /**
   * 获取所有蓝绿部署服务状态
   */
  async getBlueGreenDeployments(): Promise<BlueGreenDeployment[]> {
    try {
      // 获取所有 Target Groups
      const tgResponse = await this.client.send(new DescribeTargetGroupsCommand({}));
      const targetGroups = tgResponse.TargetGroups || [];

      // 过滤出蓝绿部署的 Target Groups
      const blueGreenServices = this.groupBlueGreenTargetGroups(targetGroups);

      // 获取每个服务的详细信息
      const deployments: BlueGreenDeployment[] = [];
      for (const [serviceName, tgs] of blueGreenServices.entries()) {
        const deployment = await this.getDeploymentInfo(serviceName, tgs);
        if (deployment) {
          deployments.push(deployment);
        }
      }

      return deployments;
    } catch (error: any) {
      throw new Error(`获取蓝绿部署信息失败: ${error.message}`);
    }
  }

  /**
   * 将 Target Groups 按服务分组
   */
  private groupBlueGreenTargetGroups(
    targetGroups: TargetGroup[]
  ): Map<string, { blue: TargetGroup; green: TargetGroup }> {
    const services = new Map<string, { blue?: TargetGroup; green?: TargetGroup }>();

    // 匹配规则：
    // - Prod: optima-prod-user-auth-blue-tg / optima-prod-user-auth-green-tg
    // - Stage: optima-stage-user-auth-blue-tg / optima-stage-user-auth-green-tg
    const envPrefix = this.environment === 'production' ? 'optima-prod' : 'optima-stage';
    const pattern = new RegExp(`^${envPrefix}-([a-z-]+)-(blue|green)-tg$`);

    for (const tg of targetGroups) {
      const match = tg.TargetGroupName?.match(pattern);
      if (match) {
        const serviceName = match[1]; // e.g., "user-auth"
        const color = match[2] as 'blue' | 'green';

        if (!services.has(serviceName)) {
          services.set(serviceName, {});
        }

        const service = services.get(serviceName)!;
        service[color] = tg;
      }
    }

    // 只返回同时有 blue 和 green 的服务
    const blueGreenServices = new Map<string, { blue: TargetGroup; green: TargetGroup }>();
    for (const [serviceName, tgs] of services.entries()) {
      if (tgs.blue && tgs.green) {
        blueGreenServices.set(serviceName, {
          blue: tgs.blue,
          green: tgs.green,
        });
      }
    }

    return blueGreenServices;
  }

  /**
   * 获取单个服务的详细部署信息
   */
  private async getDeploymentInfo(
    serviceName: string,
    tgs: { blue: TargetGroup; green: TargetGroup }
  ): Promise<BlueGreenDeployment | null> {
    try {
      // 获取 Blue Target Group 信息
      const blueInfo = await this.getTargetGroupInfo(tgs.blue, 0);

      // 获取 Green Target Group 信息
      const greenInfo = await this.getTargetGroupInfo(tgs.green, 0);

      // 获取流量权重
      const weights = await this.getTrafficWeights(tgs.blue.TargetGroupArn!, tgs.green.TargetGroupArn!);

      // 更新 weight
      blueInfo.weight = weights.blue;
      greenInfo.weight = weights.green;

      // 判断部署状态
      let status: BlueGreenDeployment['status'] = 'blue-only';
      if (weights.blue === 100 && weights.green === 0) {
        status = 'blue-only';
      } else if (weights.blue === 0 && weights.green === 100) {
        status = 'green-only';
      } else if (weights.blue > 0 && weights.green > 0 && weights.blue !== weights.green) {
        status = 'canary';
      } else {
        status = 'split';
      }

      // 推断 subdomain（从 Target Group 名称）
      // e.g., optima-prod-user-auth-blue-tg -> auth
      const subdomainMap: Record<string, string> = {
        'user-auth': 'auth',
        'mcp-host': 'mcp',
        'commerce-backend': 'api',
        'agentic-chat': 'ai',
      };
      const subdomain = subdomainMap[serviceName] || serviceName;

      return {
        service: serviceName,
        environment: this.environment as 'production' | 'stage',
        subdomain,
        blueTargetGroup: blueInfo,
        greenTargetGroup: greenInfo,
        totalTraffic: {
          blue: weights.blue,
          green: weights.green,
        },
        status,
      };
    } catch (error: any) {
      console.error(`获取 ${serviceName} 部署信息失败:`, error);
      return null;
    }
  }

  /**
   * 获取 Target Group 详细信息
   */
  private async getTargetGroupInfo(tg: TargetGroup, weight: number): Promise<TargetGroupInfo> {
    const healthResponse = await this.client.send(
      new DescribeTargetHealthCommand({
        TargetGroupArn: tg.TargetGroupArn,
      })
    );

    const targets = healthResponse.TargetHealthDescriptions || [];
    const healthyCount = targets.filter((t) => t.TargetHealth?.State === 'healthy').length;
    const unhealthyCount = targets.filter((t) => t.TargetHealth?.State === 'unhealthy').length;
    const drainingCount = targets.filter((t) => t.TargetHealth?.State === 'draining').length;

    return {
      name: tg.TargetGroupName || '',
      arn: tg.TargetGroupArn || '',
      port: tg.Port || 0,
      healthyCount,
      unhealthyCount,
      drainingCount,
      weight,
    };
  }

  /**
   * 获取流量权重
   * 从 Listener Rules 的 Forward action 中解析权重
   */
  private async getTrafficWeights(
    blueArn: string,
    greenArn: string
  ): Promise<{ blue: number; green: number }> {
    try {
      // 获取所有 Listeners（假设 ALB 只有一个主 Listener）
      const albName = this.environment === 'production' ? 'optima-prod-alb' : 'optima-stage-alb';

      // 需要先获取 Listener ARN（简化版：假设已知或从环境变量获取）
      // 实际应该通过 DescribeLoadBalancers + DescribeListeners 获取
      // 这里先返回默认值（100% Blue）
      // TODO: 实现完整的 Listener Rules 解析

      return { blue: 100, green: 0 };
    } catch (error: any) {
      console.error('获取流量权重失败:', error);
      return { blue: 100, green: 0 };
    }
  }
}
