import { Command } from 'commander';
import chalk from 'chalk';
import { getCurrentEnvironment, getCurrentEnvConfig, Environment } from '../../utils/config.js';
import { SSHClient } from '../../utils/ssh.js';
import { PromptHelper } from '../../utils/prompt.js';
import {
  isJsonOutput,
  outputSuccess,
  printTitle,
  printSection,
} from '../../utils/output.js';
import { handleError } from '../../utils/error.js';

interface ErrorLog {
  timestamp?: string;
  service: string;
  level: string;
  message: string;
  line_number?: number;
}

interface ErrorAggregation {
  pattern: string;
  count: number;
  first_seen?: string;
  last_seen?: string;
  services: string[];
  sample_message: string;
}

interface ErrorsResult {
  environment: string;
  service?: string;
  since?: string;
  errors: ErrorLog[];
  total_errors: number;
  aggregation?: ErrorAggregation[];
}

export const errorsCommand = new Command('errors')
  .description('查看容器错误日志并聚合分析')
  .option('--service <service>', '指定服务名称')
  .option('--env <env>', '环境 (production/stage/development)')
  .option('--since <time>', '时间范围 (如: 1h, 30m, 2d)', '1h')
  .option('--level <level>', '错误级别 (error/critical/warning)', 'error')
  .option('--aggregate', '聚合相似错误', false)
  .option('--json', 'JSON 格式输出')
  .action(async (options) => {
    try {
      const env: Environment = options.env || getCurrentEnvironment();
      const envConfig = getCurrentEnvConfig();

      // 交互式选择服务
      let targetService = options.service;
      if (!targetService && !isJsonOutput()) {
        targetService = await PromptHelper.selectService(Array.from(envConfig.services));
      }

      if (!isJsonOutput()) {
        const serviceText = targetService ? ` - ${targetService}` : ' - 所有服务';
        printTitle(`🔴 错误日志${serviceText} (${env} 环境)`);
        console.log(chalk.gray(`错误级别: ${options.level}`));
        console.log(chalk.gray(`时间范围: ${options.since}`));
        console.log();
      }

      const ssh = new SSHClient(env);
      await ssh.connect();

      const result: ErrorsResult = {
        environment: env,
        service: targetService,
        since: options.since,
        errors: [],
        total_errors: 0,
      };

      try {
        const services = targetService ? [targetService] : Array.from(envConfig.services);

        // 根据级别构建搜索模式
        const levelPatterns: Record<string, string> = {
          error: 'ERROR|Error|error|FATAL|Fatal|fatal',
          critical: 'CRITICAL|Critical|critical|FATAL|Fatal|fatal',
          warning: 'WARNING|Warning|warning|WARN|Warn|warn',
        };

        const searchPattern = levelPatterns[options.level] || levelPatterns.error;

        for (const service of services) {
          const containerName = env === 'production'
            ? `optima-${service}-prod`
            : env === 'stage'
            ? `optima-${service}-stage`
            : `optima-${service}-dev`;

          // 搜索错误日志
          const grepCommand = `docker logs ${containerName} --since ${options.since} 2>&1 | grep -i -n -E "${searchPattern}"`;

          try {
            const searchResult = await ssh.executeCommand(grepCommand);

            if (searchResult.stdout.trim()) {
              const lines = searchResult.stdout.trim().split('\n');

              for (const line of lines) {
                // 尝试解析行号
                const lineMatch = line.match(/^(\d+)[:-](.*)$/);
                if (lineMatch && lineMatch[1] && lineMatch[2]) {
                  // 尝试提取时间戳和级别
                  const logLine = lineMatch[2];
                  const timestampMatch = logLine.match(/(\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2})/);
                  const levelMatch = logLine.match(/\b(ERROR|CRITICAL|WARNING|FATAL|WARN)\b/i);

                  result.errors.push({
                    service,
                    line_number: parseInt(lineMatch[1]),
                    timestamp: timestampMatch && timestampMatch[1] ? timestampMatch[1] : undefined,
                    level: levelMatch && levelMatch[1] ? levelMatch[1].toUpperCase() : options.level.toUpperCase(),
                    message: logLine,
                  });
                } else {
                  result.errors.push({
                    service,
                    level: options.level.toUpperCase(),
                    message: line,
                  });
                }
              }
            }
          } catch (error: any) {
            // 没有匹配或容器不存在，继续
            if (!error.message.includes('No such container')) {
              // 忽略 grep 没有匹配的情况
            }
          }
        }

        result.total_errors = result.errors.length;

        // 如果启用聚合
        if (options.aggregate && result.errors.length > 0) {
          const aggregationMap = new Map<string, ErrorAggregation>();

          for (const error of result.errors) {
            // 提取错误消息的关键部分（去除动态内容如时间、ID等）
            const normalizedMessage = error.message
              .replace(/\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}(\.\d+)?/g, '<TIMESTAMP>')
              .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '<UUID>')
              .replace(/\b\d+\b/g, '<NUM>')
              .substring(0, 200);

            const existing = aggregationMap.get(normalizedMessage);

            if (existing) {
              existing.count++;
              existing.last_seen = error.timestamp || existing.last_seen;
              if (!existing.services.includes(error.service)) {
                existing.services.push(error.service);
              }
            } else {
              aggregationMap.set(normalizedMessage, {
                pattern: normalizedMessage,
                count: 1,
                first_seen: error.timestamp,
                last_seen: error.timestamp,
                services: [error.service],
                sample_message: error.message,
              });
            }
          }

          result.aggregation = Array.from(aggregationMap.values())
            .sort((a, b) => b.count - a.count);
        }
      } finally {
        await ssh.disconnect();
      }

      // 输出结果
      if (isJsonOutput()) {
        outputSuccess(result);
      } else {
        if (result.errors.length === 0) {
          console.log(chalk.green('✓ 未发现错误日志'));
        } else {
          // 显示聚合结果
          if (options.aggregate && result.aggregation && result.aggregation.length > 0) {
            printSection('错误聚合分析');
            console.log(chalk.red(`发现 ${result.aggregation.length} 种不同类型的错误 (共 ${result.total_errors} 条):\n`));

            for (const agg of result.aggregation.slice(0, 10)) {
              console.log(chalk.yellow(`[${agg.count}x] ${agg.services.join(', ')}`));
              console.log(chalk.gray(`  ${agg.sample_message.substring(0, 150)}`));
              if (agg.first_seen) {
                console.log(chalk.gray(`  首次: ${agg.first_seen} | 最近: ${agg.last_seen || agg.first_seen}`));
              }
              console.log();
            }

            if (result.aggregation.length > 10) {
              console.log(chalk.gray(`... 还有 ${result.aggregation.length - 10} 种错误类型`));
            }
          } else {
            // 显示原始错误列表
            printSection('错误日志');
            console.log(chalk.red(`发现 ${result.total_errors} 条错误:\n`));

            let currentService = '';
            const maxErrors = 50;

            for (const error of result.errors.slice(0, maxErrors)) {
              // 服务分隔
              if (error.service !== currentService) {
                if (currentService !== '') {
                  console.log();
                }
                currentService = error.service;
                console.log(chalk.cyan.bold(`[${error.service}]`));
              }

              // 显示错误
              const levelColor = error.level === 'CRITICAL' || error.level === 'FATAL'
                ? chalk.red.bold
                : error.level === 'ERROR'
                ? chalk.red
                : chalk.yellow;

              const prefix = error.line_number
                ? chalk.gray(`  ${error.line_number}:`)
                : '  ';

              console.log(prefix + ' ' + levelColor(`[${error.level}]`) + ' ' + error.message.substring(0, 150));
            }

            if (result.errors.length > maxErrors) {
              console.log();
              console.log(chalk.gray(`... 还有 ${result.errors.length - maxErrors} 条错误 (使用 --json 查看全部)`));
            }
          }
        }

        console.log();
        console.log(chalk.gray('💡 提示:'));
        console.log(chalk.gray('  - 使用 --aggregate 聚合相似错误'));
        console.log(chalk.gray('  - 使用 --level critical 只看严重错误'));
        console.log(chalk.gray('  - 使用 --since 2h 扩大时间范围'));
        console.log(chalk.gray('  - 使用 logs search <pattern> 进行精确搜索'));
      }
    } catch (error) {
      handleError(error);
    }
  });
