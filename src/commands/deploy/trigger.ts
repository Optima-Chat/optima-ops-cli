import { Command } from 'commander';
import chalk from 'chalk';
import { getCurrentEnvironment, Environment } from '../../utils/config.js';
import { triggerDispatch, getServiceRepo } from '../../utils/github.js';
import {
  isJsonOutput,
  outputSuccess,
  printTitle,
  printSuccess,
  printWarning,
} from '../../utils/output.js';
import { handleError } from '../../utils/error.js';
import { confirmDangerousAction } from '../../utils/prompt.js';

export const triggerCommand = new Command('trigger')
  .description('触发服务部署（需确认）')
  .argument('<service>', '服务名称')
  .option('--env <env>', '环境 (production/stage/development)')
  .option('--mode <mode>', '部署模式 (deploy-only|build-deploy)', 'deploy-only')
  .option('--yes', '跳过确认提示')
  .option('--json', 'JSON 格式输出')
  .action(async (service, options) => {
    try {
      const env: Environment = options.env || getCurrentEnvironment();
      const mode = options.mode;
      const repo = getServiceRepo(service);

      // 验证部署模式
      if (!['deploy-only', 'build-deploy'].includes(mode)) {
        throw new Error(`无效的部署模式: ${mode}。支持: deploy-only, build-deploy`);
      }

      if (!isJsonOutput()) {
        printTitle(`🚀 触发部署 - ${service} (${env})`);
        console.log(chalk.white(`部署模式: ${mode === 'deploy-only' ? '仅部署（使用已有镜像）' : '构建并部署'}\n`));
      }

      // 确认操作（除非指定了 --yes）
      if (!options.yes) {
        const confirmed = await confirmDangerousAction(
          `触发部署 (${mode})`,
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
        console.log(chalk.white('正在触发部署...\n'));
      }

      // 触发 GitHub repository_dispatch 事件
      await triggerDispatch(repo, 'ec2-recreated', {
        mode,
        environment: env,
      });

      if (isJsonOutput()) {
        outputSuccess({
          service,
          environment: env,
          repo,
          mode,
          action: 'trigger',
          status: 'dispatched',
          message: 'GitHub Actions workflow 已触发',
        });
      } else {
        printSuccess('部署已触发！');

        console.log(chalk.gray('\n部署信息:'));
        console.log(chalk.white(`  服务: ${service}`));
        console.log(chalk.white(`  环境: ${env}`));
        console.log(chalk.white(`  模式: ${mode}`));
        console.log(chalk.white(`  仓库: ${repo}`));

        console.log(chalk.gray('\n查看进度:'));
        console.log(chalk.cyan(`  optima-ops deploy status ${service} --env ${env}`));
        console.log(chalk.cyan(`  optima-ops deploy watch ${service} --env ${env}`));

        printWarning('\n注意: 部署可能需要几分钟才能开始');
        console.log(chalk.gray('GitHub Actions 需要时间处理 dispatch 事件\n'));
      }
    } catch (error) {
      handleError(error);
    }
  });
