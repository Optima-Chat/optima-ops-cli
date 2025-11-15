import {
  EC2Client,
  DescribeInstancesCommand,
  DescribeInstanceStatusCommand,
  Instance,
  InstanceStatus,
} from '@aws-sdk/client-ec2';
import { getAWSRegion } from '../config.js';
import { AWSError } from '../error.js';

// ============== EC2 客户端 ==============

/**
 * 创建 EC2 客户端
 */
export function createEC2Client(): EC2Client {
  const region = getAWSRegion();
  return new EC2Client({ region });
}

/**
 * 获取 EC2 实例信息
 */
export async function getEC2Instance(instanceId: string): Promise<Instance | undefined> {
  const client = createEC2Client();

  try {
    const command = new DescribeInstancesCommand({
      InstanceIds: [instanceId],
    });

    const response = await client.send(command);
    return response.Reservations?.[0]?.Instances?.[0];
  } catch (error: any) {
    throw new AWSError(
      `无法获取 EC2 实例信息: ${instanceId}`,
      { instanceId, error: error.message }
    );
  }
}

/**
 * 获取所有 Optima 相关的 EC2 实例
 */
export async function getOptimaEC2Instances(): Promise<Instance[]> {
  const client = createEC2Client();

  try {
    const command = new DescribeInstancesCommand({
      Filters: [
        {
          Name: 'tag:Project',
          Values: ['optima'],
        },
        {
          Name: 'instance-state-name',
          Values: ['running', 'stopped'],
        },
      ],
    });

    const response = await client.send(command);
    const instances: Instance[] = [];

    if (response.Reservations) {
      for (const reservation of response.Reservations) {
        if (reservation.Instances) {
          instances.push(...reservation.Instances);
        }
      }
    }

    return instances;
  } catch (error: any) {
    throw new AWSError(
      '无法获取 EC2 实例列表',
      { error: error.message }
    );
  }
}

/**
 * 获取 EC2 实例状态
 */
export async function getEC2InstanceStatus(instanceId: string): Promise<InstanceStatus | undefined> {
  const client = createEC2Client();

  try {
    const command = new DescribeInstanceStatusCommand({
      InstanceIds: [instanceId],
      IncludeAllInstances: true,
    });

    const response = await client.send(command);
    return response.InstanceStatuses?.[0];
  } catch (error: any) {
    throw new AWSError(
      `无法获取 EC2 实例状态: ${instanceId}`,
      { instanceId, error: error.message }
    );
  }
}

/**
 * 从实例获取标签值
 */
export function getInstanceTag(instance: Instance, key: string): string | undefined {
  return instance.Tags?.find(tag => tag.Key === key)?.Value;
}

/**
 * 获取实例的环境标签
 */
export function getInstanceEnvironment(instance: Instance): string | undefined {
  return getInstanceTag(instance, 'Environment');
}

/**
 * 获取实例的名称标签
 */
export function getInstanceName(instance: Instance): string | undefined {
  return getInstanceTag(instance, 'Name');
}

/**
 * 通过环境动态查找 EC2 实例 ID
 */
export async function findEC2InstanceByEnvironment(environment: string): Promise<string | null> {
  const nameMap: Record<string, string> = {
    production: 'optima-prod-host',
    stage: 'optima-stage-host',
    development: 'optima-dev-host',
  };

  const instanceName = nameMap[environment];
  if (!instanceName) {
    throw new AWSError(`未知环境: ${environment}`, { environment });
  }

  const client = createEC2Client();

  try {
    const command = new DescribeInstancesCommand({
      Filters: [
        { Name: 'tag:Name', Values: [instanceName] },
        { Name: 'instance-state-name', Values: ['running'] },
      ],
    });

    const response = await client.send(command);

    if (response.Reservations?.[0]?.Instances?.[0]?.InstanceId) {
      return response.Reservations[0].Instances[0].InstanceId;
    }

    return null;
  } catch (error: any) {
    throw new AWSError(
      `查找 EC2 实例失败 (环境: ${environment})`,
      { environment, error: error.message }
    );
  }
}
