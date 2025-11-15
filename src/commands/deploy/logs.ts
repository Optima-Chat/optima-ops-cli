import { Command } from 'commander';
import chalk from 'chalk';
import { getRunLogs, getWorkflowRuns, getServiceRepo, getDeployWorkflow } from '../../utils/github.js';
import { handleError } from '../../utils/error.js';
import { selectPrompt } from '../../utils/prompt.js';

export const logsCommand = new Command('logs')
  .description('查看部署日志')
  .argument('<service>', '服务名称')
  .argument('[run-id]', '运行 ID（可选，默认最新）')
  .option('--env <env>', '环境 (production/stage/development)')
  .action(async (service, runId, _options) => {
    try {
      const repo = getServiceRepo(service);

      // 如果未指定 run-id，交互式选择或使用最新
      if (!runId) {
        const workflow = await getDeployWorkflow(repo);

        if (!workflow) {
          throw new Error('未找到部署 workflow');
        }

        const runs = await getWorkflowRuns(repo, {
          workflow,
          branch: 'main',
          limit: 10,
        });

        if (runs.length === 0) {
          throw new Error('没有找到部署记录');
        }

        // 交互式选择
        try {
          const choices = runs.map(run => ({
            name: `#${run.id} - ${run.conclusion || run.status} - ${run.commit} - ${new Date(run.startedAt).toLocaleString('zh-CN')}`,
            value: run.id.toString(),
          }));

          runId = await selectPrompt('选择部署记录:', choices);
        } catch (error) {
          // 非交互模式，使用最新
          runId = runs[0]?.id?.toString();
          if (!runId) {
            throw new Error('没有找到部署记录');
          }
          console.log(chalk.gray(`使用最新部署: #${runId}\n`));
        }
      }

      console.log(chalk.cyan(`\n📝 部署日志 - ${service} #${runId}\n`));
      console.log(chalk.gray('正在获取日志...\n'));
      console.log(chalk.gray('─'.repeat(80)));

      // 获取日志
      const logs = await getRunLogs(repo, parseInt(runId));

      // 输出日志
      console.log(logs);
      console.log(chalk.gray('─'.repeat(80)));
      console.log(chalk.gray(`\n日志获取完成\n`));
    } catch (error) {
      handleError(error);
    }
  });
