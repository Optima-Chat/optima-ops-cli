import { Command } from 'commander';
import chalk from 'chalk';
import { getCurrentEnvironment, getCurrentEnvConfig, Environment } from '../../utils/config.js';
import { SSHClient } from '../../utils/ssh.js';
import { PromptHelper } from '../../utils/prompt.js';
import {
  isJsonOutput,
  outputSuccess,
  printTitle,
} from '../../utils/output.js';
import { handleError } from '../../utils/error.js';

interface TailResult {
  environment: string;
  service: string;
  lines: number;
  follow: boolean;
  since?: string;
  logs: string[];
}

export const tailCommand = new Command('tail')
  .description('查看容器日志尾部（实时或历史）')
  .argument('[service]', '服务名称')
  .option('--env <env>', '环境 (production/stage/development)')
  .option('--tail <lines>', '显示最后 N 行日志', '100')
  .option('--follow', '实时跟踪日志 (类似 tail -f)', false)
  .option('--since <time>', '时间范围 (如: 1h, 30m, 2d)')
  .option('--json', 'JSON 格式输出（不支持 --follow 模式）')
  .action(async (service, options) => {
    try {
      const env: Environment = options.env || getCurrentEnvironment();
      const envConfig = getCurrentEnvConfig();

      // 交互式选择服务
      let targetService = service;
      if (!targetService && !isJsonOutput()) {
        targetService = await PromptHelper.selectService(
          Array.from(envConfig.services),
          '选择要查看日志的服务:'
        );
      } else if (!targetService) {
        throw new Error('请指定服务名称: logs tail <service>');
      }

      const tailLines = parseInt(options.tail) || 100;

      // Follow 模式不支持 JSON 输出
      if (options.follow && isJsonOutput()) {
        throw new Error('--follow 模式不支持 JSON 输出');
      }

      if (!isJsonOutput()) {
        const followText = options.follow ? ' (实时跟踪)' : '';
        printTitle(`📜 容器日志 - ${targetService}${followText} (${env} 环境)`);
        if (options.since) {
          console.log(chalk.gray(`时间范围: ${options.since}`));
        }
        console.log(chalk.gray(`显示行数: ${tailLines}`));
        console.log();
      }

      const ssh = new SSHClient(env);
      await ssh.connect();

      const result: TailResult = {
        environment: env,
        service: targetService,
        lines: tailLines,
        follow: options.follow,
        since: options.since,
        logs: [],
      };

      try {
        const containerName = env === 'production'
          ? `optima-${targetService}-prod`
          : env === 'stage'
          ? `optima-${targetService}-stage`
          : `optima-${targetService}-dev`;

        // 构建 docker logs 命令
        let logsCommand = `docker logs ${containerName}`;

        if (options.since) {
          logsCommand += ` --since ${options.since}`;
        }

        if (options.follow) {
          // Follow 模式：实时输出
          logsCommand += ` --follow --tail ${tailLines}`;

          if (!isJsonOutput()) {
            console.log(chalk.cyan('🔄 开始实时跟踪日志... (Ctrl+C 退出)\n'));
            console.log(chalk.gray('─'.repeat(80)));
          }

          // 在 follow 模式下，直接使用 SSH 命令流式输出
          const followResult = await ssh.executeCommand(logsCommand, {
            // 这里我们让命令在后台运行，并实时显示输出
            // 注意：这可能需要特殊处理，取决于 SSH 客户端的实现
          });

          // 显示日志
          if (followResult.stdout) {
            console.log(followResult.stdout);
          }
          if (followResult.stderr) {
            console.error(chalk.yellow(followResult.stderr));
          }
        } else {
          // 静态模式：获取最后 N 行
          logsCommand += ` --tail ${tailLines} 2>&1`;

          const logsResult = await ssh.executeCommand(logsCommand);

          if (logsResult.stdout.trim()) {
            result.logs = logsResult.stdout.trim().split('\n');
          }

          // 输出结果
          if (isJsonOutput()) {
            outputSuccess(result);
          } else {
            if (result.logs.length === 0) {
              console.log(chalk.yellow('暂无日志'));
            } else {
              console.log(chalk.gray('─'.repeat(80)));

              for (const line of result.logs) {
                // 高亮不同级别的日志
                if (line.match(/\b(ERROR|CRITICAL|FATAL)\b/i)) {
                  console.log(chalk.red(line));
                } else if (line.match(/\b(WARNING|WARN)\b/i)) {
                  console.log(chalk.yellow(line));
                } else if (line.match(/\b(INFO)\b/i)) {
                  console.log(chalk.cyan(line));
                } else if (line.match(/\b(DEBUG)\b/i)) {
                  console.log(chalk.gray(line));
                } else {
                  console.log(line);
                }
              }

              console.log(chalk.gray('─'.repeat(80)));
              console.log(chalk.gray(`\n显示了最后 ${result.logs.length} 行日志`));
            }

            console.log();
            console.log(chalk.gray('💡 提示:'));
            console.log(chalk.gray('  - 使用 --follow 实时跟踪日志'));
            console.log(chalk.gray('  - 使用 --tail 200 显示更多行数'));
            console.log(chalk.gray('  - 使用 --since 1h 限制时间范围'));
            console.log(chalk.gray('  - 使用 logs search <pattern> 搜索特定内容'));
          }
        }
      } finally {
        await ssh.disconnect();
      }
    } catch (error) {
      handleError(error);
    }
  });
