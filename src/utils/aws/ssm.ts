import {
  SSMClient,
  GetParameterCommand,
  GetParametersByPathCommand,
  Parameter,
} from '@aws-sdk/client-ssm';
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
 * 获取单个参数（完整对象）
 */
export async function getParameter(name: string, decrypt = true): Promise<Parameter | undefined> {
  const client = createSSMClient();

  try {
    const command = new GetParameterCommand({
      Name: name,
      WithDecryption: decrypt,
    });

    const response = await client.send(command);
    return response.Parameter;
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
 * 获取路径下的所有参数（返回完整的 Parameter 对象数组）
 */
export async function getParametersByPath(
  path: string,
  decrypt = false
): Promise<Parameter[]> {
  const client = createSSMClient();
  const parameters: Parameter[] = [];

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
        parameters.push(...response.Parameters);
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
 * 获取路径下的所有参数（返回简单的键值对）
 */
export async function getParametersMapByPath(
  path: string,
  decrypt = true
): Promise<Record<string, string>> {
  const parameters = await getParametersByPath(path, decrypt);
  const paramMap: Record<string, string> = {};

  for (const param of parameters) {
    if (param.Name && param.Value) {
      // 移除路径前缀，只保留参数名
      const key = param.Name.replace(path, '').replace(/^\//, '');
      paramMap[key] = param.Value;
    }
  }

  return paramMap;
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

  return getParametersMapByPath(path);
}
