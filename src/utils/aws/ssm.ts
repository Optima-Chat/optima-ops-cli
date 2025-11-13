import { SSMClient, GetParameterCommand, GetParametersByPathCommand } from '@aws-sdk/client-ssm';
import { getAWSRegion } from '../config.js';
import { AWSError } from '../error.js';

// ============== SSM 客户端 ==============

/**
 * 创建 SSM 客户端
 */
export function createSSMClient(): SSMClient {
  const region = getAWSRegion();
  return new SSMClient({ region });
}

/**
 * 获取单个参数
 */
export async function getParameter(name: string, decrypt = true): Promise<string | undefined> {
  const client = createSSMClient();

  try {
    const command = new GetParameterCommand({
      Name: name,
      WithDecryption: decrypt,
    });

    const response = await client.send(command);
    return response.Parameter?.Value;
  } catch (error: any) {
    if (error.name === 'ParameterNotFound') {
      return undefined;
    }
    throw new AWSError(
      `无法获取 SSM 参数: ${name}`,
      { name, error: error.message }
    );
  }
}

/**
 * 获取路径下的所有参数
 */
export async function getParametersByPath(
  path: string,
  decrypt = true
): Promise<Record<string, string>> {
  const client = createSSMClient();
  const parameters: Record<string, string> = {};

  try {
    let nextToken: string | undefined;

    do {
      const command = new GetParametersByPathCommand({
        Path: path,
        WithDecryption: decrypt,
        Recursive: true,
        NextToken: nextToken,
      });

      const response = await client.send(command);

      if (response.Parameters) {
        for (const param of response.Parameters) {
          if (param.Name && param.Value) {
            // 移除路径前缀，只保留参数名
            const key = param.Name.replace(path, '').replace(/^\//, '');
            parameters[key] = param.Value;
          }
        }
      }

      nextToken = response.NextToken;
    } while (nextToken);

    return parameters;
  } catch (error: any) {
    throw new AWSError(
      `无法获取 SSM 参数路径: ${path}`,
      { path, error: error.message }
    );
  }
}

/**
 * 获取服务的所有环境变量
 */
export async function getServiceConfig(
  service: string,
  env: 'production' | 'stage' | 'development'
): Promise<Record<string, string>> {
  const envPrefix = env === 'production' ? 'prod' : env === 'stage' ? 'stage' : 'dev';
  const path = `/optima/${envPrefix}/${service}`;

  return getParametersByPath(path);
}
