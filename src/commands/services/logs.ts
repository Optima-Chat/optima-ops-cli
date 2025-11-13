import { Command } from 'commander';
import chalk from 'chalk';
import { getCurrentEnvironment, getCurrentEnvConfig, Environment } from '../../utils/config.js';
import { SSHClient } from '../../utils/ssh.js';
import { handleError } from '../../utils/error.js';
import { selectService } from '../../utils/prompt.js';

export const logsCommand = new Command('logs')
  .description('查看容器日志')
  .argument('[service]', '服务名称')
  .option('--env <env>', '环境 (production/stage/development)')
  .option('--tail <lines>', '显示最后 N 行', '100')
  .option('--follow', '持续跟踪日志（类似 tail -f）')
  .option('--since <time>', '显示指定时间之后的日志（如：10m, 1h, 2d）')
  .action(async (service, options) => {
    try {
      const env: Environment = options.env || getCurrentEnvironment();
      const envConfig = getCurrentEnvConfig();
      const services = [...envConfig.services];

      // 选择服务（交互式）
      if (!service) {
        service = await selectService(services, '选择要查看日志的服务:');
      } else if (!services.includes(service)) {
        throw new Error(`未知服务: ${service}`);
      }

      const containerName = `optima-${service}-${env === 'production' ? 'prod' : env}`;

      console.log(chalk.cyan(`\n📝 ${service} 容器日志 - ${env} 环境\n`));

      // 构建 docker logs 命令
      let command = `docker logs`;

      if (options.tail) {
        command += ` --tail ${options.tail}`;
      }

      if (options.since) {
        command += ` --since ${options.since}`;
      }

      if (options.follow) {
        command += ` -f`;
      }

      command += ` ${containerName}`;

      // 连接 SSH
      const ssh = new SSHClient(env);
      await ssh.connect();

      try {
        if (options.follow) {
          // 持续跟踪模式：使用流式输出
          console.log(chalk.gray(`执行命令: ${command}`));
          console.log(chalk.gray(`按 Ctrl+C 停止跟踪\n`));
          console.log(chalk.gray('─'.repeat(80)));

          // 执行命令（不验证安全性，因为这是 docker logs -f）
          const result = await ssh.executeCommand(command, {
            validateSafety: false,
            timeout: 0, // 无超时
          });

          // 输出日志
          if (result.stdout) {
            console.log(result.stdout);
          }
          if (result.stderr) {
            console.error(chalk.red(result.stderr));
          }
        } else {
          // 一次性获取模式
          const result = await ssh.getContainerLogs(containerName, {
            tail: parseInt(options.tail),
          });

          if (result.exitCode !== 0) {
            throw new Error(result.stderr || '获取日志失败');
          }

          // 输出日志
          console.log(chalk.gray('─'.repeat(80)));
          if (result.stdout) {
            console.log(result.stdout);
          } else {
            console.log(chalk.yellow('没有日志输出'));
          }
          console.log(chalk.gray('─'.repeat(80)));
          console.log(chalk.gray(`\n显示最后 ${options.tail} 行`));

          if (options.since) {
            console.log(chalk.gray(`时间范围: 最近 ${options.since}`));
          }

          console.log(chalk.gray(`\n提示: 使用 --follow 参数可持续跟踪日志\n`));
        }
      } finally {
        ssh.disconnect();
      }
    } catch (error) {
      handleError(error);
    }
  });
