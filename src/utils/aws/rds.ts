import {
  RDSClient,
  DescribeDBInstancesCommand,
  DBInstance,
} from '@aws-sdk/client-rds';
import { getAWSRegion } from '../config.js';
import { AWSError } from '../error.js';

// ============== RDS 客户端 ==============

/**
 * 创建 RDS 客户端
 */
export function createRDSClient(): RDSClient {
  const region = getAWSRegion();
  return new RDSClient({ region });
}

/**
 * 获取 RDS 实例信息
 */
export async function getRDSInstance(instanceId: string): Promise<DBInstance | undefined> {
  const client = createRDSClient();

  try {
    const command = new DescribeDBInstancesCommand({
      DBInstanceIdentifier: instanceId,
    });

    const response = await client.send(command);
    return response.DBInstances?.[0];
  } catch (error: any) {
    throw new AWSError(
      `无法获取 RDS 实例信息: ${instanceId}`,
      { instanceId, error: error.message }
    );
  }
}

/**
 * 获取所有 Optima 相关的 RDS 实例
 */
export async function getOptimaRDSInstances(): Promise<DBInstance[]> {
  const client = createRDSClient();

  try {
    const command = new DescribeDBInstancesCommand({});
    const response = await client.send(command);

    if (!response.DBInstances) {
      return [];
    }

    // 过滤出 Optima 相关的实例（通过名称匹配）
    return response.DBInstances.filter(instance =>
      instance.DBInstanceIdentifier?.includes('optima')
    );
  } catch (error: any) {
    throw new AWSError(
      '无法获取 RDS 实例列表',
      { error: error.message }
    );
  }
}

/**
 * 获取 RDS 实例端点
 */
export function getRDSEndpoint(instance: DBInstance): string | undefined {
  return instance.Endpoint?.Address;
}

/**
 * 获取 RDS 实例端口
 */
export function getRDSPort(instance: DBInstance): number | undefined {
  return instance.Endpoint?.Port;
}

/**
 * 获取 RDS 实例状态
 */
export function getRDSStatus(instance: DBInstance): string | undefined {
  return instance.DBInstanceStatus;
}

/**
 * 获取 RDS 实例引擎
 */
export function getRDSEngine(instance: DBInstance): string | undefined {
  return instance.Engine;
}

/**
 * 获取 RDS 实例版本
 */
export function getRDSEngineVersion(instance: DBInstance): string | undefined {
  return instance.EngineVersion;
}

/**
 * 检查 RDS 实例是否可用
 */
export function isRDSInstanceAvailable(instance: DBInstance): boolean {
  return instance.DBInstanceStatus === 'available';
}
