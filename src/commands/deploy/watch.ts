import { Command } from 'commander';
import chalk from 'chalk';
import { getCurrentEnvironment, Environment } from '../../utils/config.js';
import { watchRun, getServiceRepo, getDeployWorkflow } from '../../utils/github.js';
import { handleError } from '../../utils/error.js';

export const watchCommand = new Command('watch')
  .description('实时监控部署进度')
  .argument('<service>', '服务名称')
  .argument('[run-id]', '运行 ID（可选，默认最新）')
  .option('--env <env>', '环境 (production/stage/development)')
  .action(async (service, runId, options) => {
    try {
      const env: Environment = options.env || getCurrentEnvironment();
      const repo = getServiceRepo(service);

      console.log(chalk.cyan(`\n👀 监控部署 - ${service} (${env})\n`));

      if (!runId) {
        // 如果未指定 run-id，需要获取最新的
        const { getWorkflowRuns } = await import('../../utils/github.js');
        const workflow = await getDeployWorkflow(repo);

        if (!workflow) {
          throw new Error('未找到部署 workflow');
        }

        const runs = await getWorkflowRuns(repo, {
          workflow,
          branch: 'main',
          limit: 1,
        });

        if (runs.length === 0) {
          throw new Error('没有找到部署记录');
        }

        runId = runs[0]?.id?.toString();
        if (!runId) {
          throw new Error('没有找到部署记录');
        }
        console.log(chalk.gray(`使用最新部署: #${runId}\n`));
      }

      // 实时监控
      await watchRun(repo, parseInt(runId as string));

      console.log(chalk.green('\n✓ 部署监控完成\n'));
    } catch (error) {
      handleError(error);
    }
  });
