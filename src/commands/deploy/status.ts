import { Command } from 'commander';
import { getCurrentEnvironment, Environment } from '../../utils/config.js';
import { getWorkflowRuns, getServiceRepo } from '../../utils/github.js';
import {
  isJsonOutput,
  outputSuccess,
  printTitle,
  createTable,
  formatRelativeTime,
  formatStatus,
} from '../../utils/output.js';
import { handleError } from '../../utils/error.js';

export const statusCommand = new Command('status')
  .description('查看部署状态')
  .argument('<service>', '服务名称')
  .option('--env <env>', '环境 (production/stage/development)')
  .option('--limit <number>', '显示数量', '10')
  .option('--json', 'JSON 格式输出')
  .action(async (service, options) => {
    try {
      const env: Environment = options.env || getCurrentEnvironment();
      const limit = parseInt(options.limit);
      const repo = getServiceRepo(service);

      if (!isJsonOutput()) {
        printTitle(`📋 部署历史 - ${service} (${env})`);
      }

      // 获取 workflow runs
      const runs = await getWorkflowRuns(repo, {
        workflow: 'deploy.yml',
        branch: 'main',
        limit,
      });

      if (isJsonOutput()) {
        outputSuccess({
          service,
          environment: env,
          repo,
          runs: runs.map(run => ({
            id: run.id,
            status: run.status,
            conclusion: run.conclusion,
            branch: run.branch,
            commit: run.commit,
            started_at: run.startedAt,
            updated_at: run.updatedAt,
            url: run.url,
          })),
        });
      } else {
        const table = createTable({
          head: ['ID', '状态', '分支', '提交', '时间', 'URL'],
        });

        for (const run of runs) {
          const status = run.conclusion
            ? formatStatus(run.conclusion)
            : formatStatus(run.status);

          table.push([
            run.id.toString(),
            status,
            run.branch,
            run.commit,
            formatRelativeTime(run.startedAt),
            run.url,
          ]);
        }

        console.log(table.toString());
        console.log();
      }
    } catch (error) {
      handleError(error);
    }
  });
