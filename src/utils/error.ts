import chalk from 'chalk';
import { outputError, isJsonOutput } from './output.js';

// ============== 自定义错误类 ==============

/**
 * 基础错误类
 */
export class OpsCLIError extends Error {
  code: string;
  details?: any;

  constructor(message: string, code = 'OPS_CLI_ERROR', details?: any) {
    super(message);
    this.name = 'OpsCLIError';
    this.code = code;
    this.details = details;
  }
}

/**
 * SSH 连接错误
 */
export class SSHConnectionError extends OpsCLIError {
  constructor(message: string, details?: any) {
    super(message, 'SSH_CONNECTION_ERROR', details);
    this.name = 'SSHConnectionError';
  }
}

/**
 * AWS 错误
 */
export class AWSError extends OpsCLIError {
  constructor(message: string, details?: any) {
    super(message, 'AWS_ERROR', details);
    this.name = 'AWSError';
  }
}

/**
 * 配置错误
 */
export class ConfigurationError extends OpsCLIError {
  constructor(message: string, details?: any) {
    super(message, 'CONFIGURATION_ERROR', details);
    this.name = 'ConfigurationError';
  }
}

/**
 * 命令执行错误
 */
export class CommandExecutionError extends OpsCLIError {
  constructor(message: string, details?: any) {
    super(message, 'COMMAND_EXECUTION_ERROR', details);
    this.name = 'CommandExecutionError';
  }
}

/**
 * 验证错误
 */
export class ValidationError extends OpsCLIError {
  constructor(message: string, details?: any) {
    super(message, 'VALIDATION_ERROR', details);
    this.name = 'ValidationError';
  }
}

// ============== 错误处理器 ==============

/**
 * 处理并输出错误
 */
export function handleError(error: any): void {
  if (isJsonOutput()) {
    // JSON 格式输出
    if (error instanceof OpsCLIError) {
      outputError({
        message: error.message,
        details: error.details,
      }, error.code);
    } else {
      outputError({
        message: error.message || String(error),
      }, 'UNKNOWN_ERROR');
    }
  } else {
    // 人类可读格式
    console.error(chalk.red(`\n✗ 错误: ${error.message || String(error)}\n`));

    // 如果有详细信息，显示它
    if (error.details) {
      console.error(chalk.gray('详细信息:'));
      console.error(chalk.gray(JSON.stringify(error.details, null, 2)));
      console.log();
    }

    // 如果是已知错误类型，提供帮助信息
    if (error instanceof SSHConnectionError) {
      console.error(chalk.yellow('提示: 请检查 SSH 密钥和网络连接'));
      console.error(chalk.gray('  1. 确认 SSH 密钥存在: ~/.ssh/optima-ec2-key'));
      console.error(chalk.gray('  2. 确认密钥权限正确: chmod 600 ~/.ssh/optima-ec2-key'));
      console.error(chalk.gray('  3. 确认能访问 EC2 实例'));
      console.log();
    } else if (error instanceof AWSError) {
      console.error(chalk.yellow('提示: 请检查 AWS 配置和权限'));
      console.error(chalk.gray('  1. 确认 AWS CLI 已配置: aws configure'));
      console.error(chalk.gray('  2. 确认 IAM 权限正确'));
      console.error(chalk.gray('  3. 确认使用正确的 AWS Profile'));
      console.log();
    } else if (error instanceof ConfigurationError) {
      console.error(chalk.yellow('提示: 请检查配置文件'));
      console.error(chalk.gray('  配置文件位置: ~/.config/optima-ops-cli/config.json'));
      console.log();
    }
  }

  process.exit(1);
}

/**
 * 包装异步函数，自动处理错误
 */
export function withErrorHandler<T extends (...args: any[]) => Promise<any>>(
  fn: T
): T {
  return (async (...args: any[]) => {
    try {
      return await fn(...args);
    } catch (error) {
      handleError(error);
    }
  }) as T;
}
