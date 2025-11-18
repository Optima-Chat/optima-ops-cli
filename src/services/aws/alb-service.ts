import {
  ElasticLoadBalancingV2Client,
  DescribeTargetGroupsCommand,
  DescribeTargetHealthCommand,
  DescribeRulesCommand,
  DescribeListenersCommand,
} from '@aws-sdk/client-elastic-load-balancing-v2';

export interface TrafficSplit {
  blue: number;
  green: number;
}

export interface TargetGroupHealth {
  healthy: number;
  unhealthy: number;
  total: number;
}

export class ALBService {
  private client: ElasticLoadBalancingV2Client;

  constructor(region: string = 'ap-southeast-1') {
    this.client = new ElasticLoadBalancingV2Client({ region });
  }

  /**
   * 获取流量分配比例（Blue/Green）
   * 基于 ALB listener rules 的权重
   */
  async getTrafficSplit(listenerArn: string): Promise<TrafficSplit> {
    try {
      // 获取所有规则
      const rulesCommand = new DescribeRulesCommand({
        ListenerArn: listenerArn,
      });

      const rulesResponse = await this.client.send(rulesCommand);
      const rules = rulesResponse.Rules ?? [];

      let blueWeight = 0;
      let greenWeight = 0;

      // 遍历规则，找到包含 blue 和 green 的 forward 动作
      for (const rule of rules) {
        const actions = rule.Actions ?? [];
        for (const action of actions) {
          if (action.Type === 'forward' && action.ForwardConfig) {
            const targetGroups =
              action.ForwardConfig.TargetGroups ?? [];

            for (const tg of targetGroups) {
              const tgArn = tg.TargetGroupArn ?? '';
              const weight = tg.Weight ?? 0;

              // 判断是 blue 还是 green（基于 ARN 命名）
              if (tgArn.includes('-blue')) {
                blueWeight += weight;
              } else if (tgArn.includes('-green')) {
                greenWeight += weight;
              }
            }
          }
        }
      }

      const total = blueWeight + greenWeight;
      if (total === 0) {
        return { blue: 100, green: 0 }; // 默认 Blue
      }

      return {
        blue: Math.round((blueWeight / total) * 100),
        green: Math.round((greenWeight / total) * 100),
      };
    } catch (error) {
      const err = error as Error;
      throw new Error(
        `Failed to get traffic split: ${err.message}`,
      );
    }
  }

  /**
   * 获取目标组健康状态
   */
  async getTargetHealth(
    targetGroupArn: string,
  ): Promise<TargetGroupHealth> {
    try {
      const command = new DescribeTargetHealthCommand({
        TargetGroupArn: targetGroupArn,
      });

      const response = await this.client.send(command);
      const targets = response.TargetHealthDescriptions ?? [];

      const healthy = targets.filter(
        (t) => t.TargetHealth?.State === 'healthy',
      ).length;
      const unhealthy = targets.filter(
        (t) => t.TargetHealth?.State === 'unhealthy',
      ).length;

      return {
        healthy,
        unhealthy,
        total: targets.length,
      };
    } catch (error) {
      const err = error as Error;
      throw new Error(
        `Failed to get target health: ${err.message}`,
      );
    }
  }

  /**
   * 查找目标组 ARN（基于名称）
   */
  async findTargetGroupArn(targetGroupName: string): Promise<string | null> {
    try {
      const command = new DescribeTargetGroupsCommand({
        Names: [targetGroupName],
      });

      const response = await this.client.send(command);
      const targetGroups = response.TargetGroups ?? [];

      if (targetGroups.length === 0) {
        return null;
      }

      return targetGroups[0]?.TargetGroupArn ?? null;
    } catch (error) {
      // 目标组不存在
      return null;
    }
  }
}
