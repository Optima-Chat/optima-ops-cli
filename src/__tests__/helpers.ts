/**
 * 测试辅助工具
 */

import { Parameter } from '@aws-sdk/client-ssm';

/**
 * 创建模拟的 AWS Parameter
 */
export function createMockParameter(
  name: string,
  value: string,
  type: 'String' | 'SecureString' = 'String',
  version = 1
): Parameter {
  return {
    Name: name,
    Value: value,
    Type: type,
    Version: version,
    LastModifiedDate: new Date('2025-01-14T00:00:00Z'),
    ARN: `arn:aws:ssm:ap-southeast-1:123456789012:parameter${name}`,
  };
}

/**
 * 创建模拟的 SSH 执行结果
 */
export function createMockSSHResult(stdout: string, stderr = '', exitCode = 0) {
  return {
    stdout,
    stderr,
    exitCode,
  };
}

/**
 * 等待指定时间
 */
export function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 捕获异步错误
 */
export async function expectAsyncError(
  fn: () => Promise<any>,
  errorMessage?: string | RegExp
): Promise<Error> {
  try {
    await fn();
    throw new Error('Expected function to throw an error');
  } catch (error: any) {
    if (errorMessage) {
      if (typeof errorMessage === 'string') {
        expect(error.message).toContain(errorMessage);
      } else {
        expect(error.message).toMatch(errorMessage);
      }
    }
    return error;
  }
}
