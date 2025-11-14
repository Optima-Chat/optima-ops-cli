import { Command } from 'commander';
import chalk from 'chalk';
import { getCurrentEnvironment, Environment } from '../../utils/config.js';
import { getWorkflowRuns, getServiceRepo, getDeployWorkflow } from '../../utils/github.js';
import {
  isJsonOutput,
  outputSuccess,
  printTitle,
  createTable,
  formatRelativeTime,
  formatStatus,
} from '../../utils/output.js';
import { handleError } from '../../utils/error.js';
import { CommandTimer, isTimingEnabled } from '../../utils/timer.js';

export const statusCommand = new Command('status')
  .description('查看部署状态')
  .argument('<service>', '服务名称')
  .option('--env <env>', '环境 (production/stage/development)')
  .option('--limit <number>', '显示数量', '10')
  .option('--json', 'JSON 格式输出')
  .action(async (service, options) => {
    try {
      const timer = new CommandTimer();
      const env: Environment = options.env || getCurrentEnvironment();
      const limit = parseInt(options.limit);
      const repo = getServiceRepo(service);

      if (!isJsonOutput()) {
        printTitle(`📋 部署历史 - ${service} (${env})`);
      }

      // 自动检测 workflow 文件名
      const workflow = await getDeployWorkflow(repo);
      timer.step('检测 workflow');

      if (!workflow) {
        throw new Error(`未找到仓库 ${repo} 的部署 workflow 文件`);
      }

      // 获取 workflow runs
      const runs = await getWorkflowRuns(repo, {
        workflow,
        branch: 'main',
        limit,
      });
      timer.step('获取部署历史');

      if (isJsonOutput()) {
        const output = {
          service,
          environment: env,
          repo,
          workflow,
          runs: runs.map(run => ({
            id: run.id,
            number: run.number,
            status: run.status,
            conclusion: run.conclusion,
            branch: run.branch,
            commit: run.commit,
            started_at: run.startedAt,
            updated_at: run.updatedAt,
            url: run.url,
          })),
          _timing: isTimingEnabled() ? timer.getTimingData() : undefined,
        };
        outputSuccess(output);
      } else {
        if (runs && runs.length > 0) {
          const table = createTable({
            head: ['#', '状态', '分支', '提交', '时间'],
          });

          for (const run of runs) {
            const displayStatus = run.conclusion
              ? formatStatus(run.conclusion || 'unknown')
              : formatStatus(run.status || 'unknown');

            table.push([
              run.number?.toString() || 'N/A',
              displayStatus,
              run.branch || 'N/A',
              run.commit || 'N/A',
              run.startedAt ? formatRelativeTime(run.startedAt) : 'N/A',
            ]);
          }

          console.log(table.toString());
          console.log();
          console.log(chalk.gray(`找到 ${runs.length} 条部署记录`));
        } else {
          console.log(chalk.yellow('未找到部署记录'));
        }

        if (isTimingEnabled()) {
          timer.printSummary();
        }
      }
    } catch (error) {
      handleError(error);
    }
  });
