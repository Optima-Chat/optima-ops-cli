import chalk from 'chalk';
import Table from 'cli-table3';

// ============== 输出格式 ==============

export type OutputFormat = 'human' | 'json';

/**
 * 判断是否使用 JSON 输出
 */
export function isJsonOutput(): boolean {
  return process.env.OPTIMA_OUTPUT === 'json' || process.argv.includes('--json');
}

/**
 * 获取输出格式
 */
export function getOutputFormat(): OutputFormat {
  return isJsonOutput() ? 'json' : 'human';
}

// ============== JSON 输出 ==============

/**
 * 输出成功结果（JSON 格式）
 */
export function outputSuccess(data: any): void {
  console.log(JSON.stringify({
    success: true,
    data,
  }, null, 2));
}

/**
 * 输出错误结果（JSON 格式）
 */
export function outputError(error: any, code?: string): void {
  console.error(JSON.stringify({
    success: false,
    error: {
      code: code || 'UNKNOWN_ERROR',
      message: error.message || String(error),
      details: error.details || undefined,
    },
  }, null, 2));
}

// ============== 人类可读输出 ==============

/**
 * 创建表格
 */
export function createTable(options?: {
  head?: string[];
  colWidths?: number[];
  style?: any;
}): Table.Table {
  return new Table({
    head: options?.head || [],
    colWidths: options?.colWidths,
    style: {
      head: ['cyan'],
      border: ['gray'],
      ...options?.style,
    },
  });
}

/**
 * 打印标题
 */
export function printTitle(title: string): void {
  console.log(chalk.cyan(`\n${title}\n`));
}

/**
 * 打印成功消息
 */
export function printSuccess(message: string): void {
  console.log(chalk.green(`✓ ${message}`));
}

/**
 * 打印错误消息
 */
export function printError(message: string): void {
  console.log(chalk.red(`✗ ${message}`));
}

/**
 * 打印警告消息
 */
export function printWarning(message: string): void {
  console.log(chalk.yellow(`⚠ ${message}`));
}

/**
 * 打印信息消息
 */
export function printInfo(message: string): void {
  console.log(chalk.blue(`ℹ ${message}`));
}

/**
 * 打印分隔线
 */
export function printSeparator(): void {
  console.log(chalk.gray('─'.repeat(60)));
}

/**
 * 打印章节标题
 */
export function printSection(title: string): void {
  console.log();
  console.log(chalk.cyan.bold(`${title}`));
  console.log(chalk.gray('─'.repeat(Math.min(title.length + 2, 60))));
}

/**
 * 打印键值对
 */
export function printKeyValue(key: string, value: string, indent = 0): void {
  const spaces = '  '.repeat(indent);
  console.log(`${spaces}${chalk.gray(key + ':')} ${value}`);
}

/**
 * 打印列表项
 */
export function printListItem(text: string, indent = 0): void {
  const spaces = '  '.repeat(indent);
  console.log(`${spaces}${chalk.gray('•')} ${text}`);
}

// ============== 格式化工具 ==============

/**
 * 格式化字节大小
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

/**
 * 格式化持续时间（毫秒）
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${(ms / 60000).toFixed(1)}m`;
  return `${(ms / 3600000).toFixed(1)}h`;
}

/**
 * 格式化相对时间
 */
export function formatRelativeTime(date: Date | string): string {
  const now = Date.now();
  const target = typeof date === 'string' ? new Date(date).getTime() : date.getTime();
  const diff = now - target;

  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
  if (diff < 2592000000) return `${Math.floor(diff / 86400000)} 天前`;
  if (diff < 31536000000) return `${Math.floor(diff / 2592000000)} 个月前`;
  return `${Math.floor(diff / 31536000000)} 年前`;
}

/**
 * 格式化百分比
 */
export function formatPercentage(value: number, total: number): string {
  if (total === 0) return '0%';
  return `${((value / total) * 100).toFixed(1)}%`;
}

/**
 * 格式化状态（带颜色）
 */
export function formatStatus(status: string): string {
  const statusMap: Record<string, any> = {
    success: chalk.green('✓ 成功'),
    failed: chalk.red('✗ 失败'),
    running: chalk.yellow('● 运行中'),
    stopped: chalk.gray('○ 停止'),
    pending: chalk.blue('⧗ 等待中'),
    healthy: chalk.green('✓ 健康'),
    unhealthy: chalk.red('✗ 不健康'),
  };

  return statusMap[status.toLowerCase()] || status;
}

/**
 * 脱敏敏感信息
 */
export function maskSensitive(text: string): string {
  // 脱敏密码
  text = text.replace(/password[=:]\s*\S+/gi, 'password=***');

  // 脱敏 token
  text = text.replace(/token[=:]\s*\S+/gi, 'token=***');

  // 脱敏连接字符串中的密码
  text = text.replace(/(:\/\/[^:]+:)([^@]+)(@)/g, '$1***$3');

  // 脱敏 AWS 密钥
  text = text.replace(/AKIA[0-9A-Z]{16}/g, 'AKIA***');
  text = text.replace(/aws_secret_access_key[=:]\s*\S+/gi, 'aws_secret_access_key=***');

  return text;
}
