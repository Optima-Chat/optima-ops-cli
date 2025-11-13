import { Command } from 'commander';
import chalk from 'chalk';
import { getCurrentEnvironment, getCurrentEnvConfig, Environment } from '../../utils/config.js';
import { SSHClient } from '../../utils/ssh.js';
import {
  isJsonOutput,
  outputSuccess,
  printTitle,
  printSuccess,
  printWarning,
} from '../../utils/output.js';
import { handleError } from '../../utils/error.js';
import { selectService, confirmDangerousAction } from '../../utils/prompt.js';

export const restartCommand = new Command('restart')
  .description('重启服务容器（需确认）')
  .argument('[service]', '服务名称')
  .option('--env <env>', '环境 (production/stage/development)')
  .option('--yes', '跳过确认提示')
  .option('--json', 'JSON 格式输出')
  .action(async (service, options) => {
    try {
      const env: Environment = options.env || getCurrentEnvironment();
      const envConfig = getCurrentEnvConfig();
      const services = [...envConfig.services];

      // 选择服务（交互式）
      if (!service) {
        service = await selectService(services, '选择要重启的服务:');
      } else if (!services.includes(service)) {
        throw new Error(`未知服务: ${service}`);
      }

      const containerName = `optima-${service}-${env === 'production' ? 'prod' : env}`;

      if (!isJsonOutput()) {
        printTitle(`🔄 重启服务 - ${service} (${env})`);
      }

      // 确认操作（除非指定了 --yes）
      if (!options.yes) {
        const confirmed = await confirmDangerousAction(
          '重启服务',
          service,
          env
        );

        if (!confirmed) {
          if (!isJsonOutput()) {
            console.log(chalk.yellow('\n操作已取消\n'));
          }
          return;
        }
      }

      if (!isJsonOutput()) {
        console.log(chalk.white('\n正在重启容器...'));
      }

      // 连接 SSH
      const ssh = new SSHClient(env);
      await ssh.connect();

      try {
        const startTime = Date.now();

        // 使用 docker-compose restart（更安全）
        const restartResult = await ssh.dockerComposeCommand(
          service,
          `restart`
        );

        const duration = Date.now() - startTime;

        if (restartResult.exitCode !== 0) {
          throw new Error(restartResult.stderr || '重启失败');
        }

        // 验证容器是否重启成功
        const statusResult = await ssh.getContainerStatus(containerName);
        const isRunning = statusResult.stdout.includes('Up');

        if (isJsonOutput()) {
          outputSuccess({
            service,
            environment: env,
            container_name: containerName,
            action: 'restart',
            status: isRunning ? 'success' : 'failed',
            duration_ms: duration,
          });
        } else {
          if (isRunning) {
            printSuccess(`服务已成功重启 (${duration}ms)`);
            console.log(chalk.gray(`\n容器: ${containerName}`));
            console.log(chalk.gray(`用时: ${(duration / 1000).toFixed(1)} 秒\n`));
          } else {
            printWarning('重启命令已执行，但容器未运行');
            console.log(chalk.gray('\n请使用以下命令检查状态:'));
            console.log(chalk.cyan(`  optima-ops services status --service ${service} --env ${env}\n`));
          }
        }
      } finally {
        ssh.disconnect();
      }
    } catch (error) {
      handleError(error);
    }
  });
