import { Command } from 'commander';
import chalk from 'chalk';
import { getCurrentEnvironment, getCurrentEnvConfig, Environment } from '../../utils/config.js';
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

export const listCommand = new Command('list')
  .description('列出所有服务的部署状态')
  .option('--env <env>', '环境 (production/stage/development)')
  .option('--limit <number>', '每个服务显示数量', '3')
  .option('--json', 'JSON 格式输出')
  .action(async (options) => {
    try {
      const env: Environment = options.env || getCurrentEnvironment();
      const envConfig = getCurrentEnvConfig();
      const services = [...envConfig.services];
      const limit = parseInt(options.limit);

      if (!isJsonOutput()) {
        printTitle(`📋 所有服务部署状态 - ${env} 环境`);
      }

      const results: any = {};

      for (const service of services) {
        if (!isJsonOutput()) {
          process.stdout.write(chalk.white(`\n${service}... `));
        }

        try {
          const repo = getServiceRepo(service);
          const workflow = await getDeployWorkflow(repo);

          if (!workflow) {
            throw new Error('未找到 workflow');
          }

          const runs = await getWorkflowRuns(repo, {
            workflow,
            branch: 'main',
            limit,
          });

          results[service] = {
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
          };

          if (!isJsonOutput()) {
            const latest = runs[0];
            if (latest) {
              const statusText = latest.conclusion
                ? formatStatus(latest.conclusion)
                : formatStatus(latest.status);
              console.log(`${statusText} (${formatRelativeTime(latest.startedAt)})`);
            } else {
              console.log(chalk.gray('无部署记录'));
            }
          }
        } catch (error: any) {
          results[service] = {
            error: error.message,
          };

          if (!isJsonOutput()) {
            console.log(chalk.red(`错误: ${error.message}`));
          }
        }
      }

      if (isJsonOutput()) {
        outputSuccess({
          environment: env,
          services: results,
        });
      } else {
        // 打印详细表格
        console.log(chalk.cyan('\n最近部署:'));

        for (const service of services) {
          if (results[service].error) {
            continue;
          }

          const runs = results[service].runs;
          if (runs.length === 0) {
            continue;
          }

          console.log(chalk.white(`\n  ${service}:`));
          const table = createTable({
            head: ['ID', '状态', '提交', '时间'],
          });

          for (const run of runs) {
            const status = run.conclusion
              ? formatStatus(run.conclusion)
              : formatStatus(run.status);

            table.push([
              run.id.toString(),
              status,
              run.commit,
              formatRelativeTime(run.started_at),
            ]);
          }

          console.log(table.toString().split('\n').map((line: string) => '    ' + line).join('\n'));
        }

        console.log(chalk.gray(`\n提示: 使用 "deploy status <service>" 查看详细信息\n`));
      }
    } catch (error) {
      handleError(error);
    }
  });
