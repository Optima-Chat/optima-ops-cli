import { Command } from 'commander';
import chalk from 'chalk';
import { getCurrentEnvironment, Environment } from '../../utils/config.js';
import { DatabaseClient } from '../../db/client.js';
import { getDatabasePassword } from '../../db/password.js';
import { handleError } from '../../utils/error.js';
import { isJsonOutput, outputSuccess, printTitle, createTable, printKeyValue } from '../../utils/output.js';
import { CACHE_HIT_RATIO_QUERY, CACHE_HIT_BY_TABLE_QUERY } from '../../db/queries/health.js';

export const cacheHitCommand = new Command('cache-hit')
  .description('显示缓存命中率')
  .option('--database <name>', '数据库名称')
  .option('--env <env>', '环境 (production/stage/development)')
  .option('--by-table', '按表显示')
  .option('--json', 'JSON 格式输出')
  .action(async (options) => {
    try {
      const env: Environment = options.env || getCurrentEnvironment();
      const database = options.database || 'postgres';

      if (!isJsonOutput()) {
        printTitle(`📊 缓存命中率 - ${database}`);
        console.log(chalk.gray('正在查询缓存统计...\\n'));
      }

      const password = await getDatabasePassword(env, database);
      const client = new DatabaseClient(env, database, password);

      await client.connect();

      try {
        // Get overall cache hit ratio
        const overallResult = await client.query<{ cache_hit_ratio: number }>(
          CACHE_HIT_RATIO_QUERY
        );

        const overallRatio = overallResult.rows[0]?.cache_hit_ratio || 0;

        if (options.byTable) {
          // Get cache hit ratio by table
          const byTableResult = await client.query(CACHE_HIT_BY_TABLE_QUERY);

          if (isJsonOutput()) {
            outputSuccess({
              environment: env,
              database,
              overall_cache_hit_ratio: overallRatio,
              by_table: byTableResult.rows,
            });
          } else {
            printKeyValue('整体命中率', `${overallRatio}%`);
            console.log();

            console.log(chalk.cyan('按表统计:'));
            const table = createTable({
              head: ['表名', '总读取', '命中率'],
            });

            for (const row of byTableResult.rows) {
              const ratio = row.cache_hit_ratio;
              const ratioColor =
                ratio >= 99
                  ? chalk.green
                  : ratio >= 95
                  ? chalk.yellow
                  : chalk.red;

              table.push([
                row.table_name,
                row.total_reads.toLocaleString(),
                ratioColor(`${ratio}%`),
              ]);
            }

            console.log(table.toString());
            console.log();
          }
        } else {
          if (isJsonOutput()) {
            outputSuccess({
              environment: env,
              database,
              cache_hit_ratio: overallRatio,
              target: 99.0,
              status:
                overallRatio >= 99 ? 'ok' : overallRatio >= 95 ? 'warning' : 'critical',
            });
          } else {
            const statusColor =
              overallRatio >= 99
                ? chalk.green
                : overallRatio >= 95
                ? chalk.yellow
                : chalk.red;

            printKeyValue('缓存命中率', statusColor(`${overallRatio}%`));
            printKeyValue('目标', '≥ 99%');
            printKeyValue(
              '状态',
              statusColor(
                overallRatio >= 99
                  ? '优秀'
                  : overallRatio >= 95
                  ? '一般'
                  : '差'
              )
            );

            if (overallRatio < 99) {
              console.log();
              console.log(chalk.yellow('💡 建议:'));
              console.log(
                chalk.gray(
                  '  • 命中率低于 99% 可能表示内存不足或工作集过大'
                )
              );
              console.log(chalk.gray('  • 考虑增加 shared_buffers 配置'));
              console.log(
                chalk.gray('  • 使用 --by-table 查看具体哪些表的命中率低')
              );
            }

            console.log();
          }
        }
      } finally {
        await client.disconnect();
      }
    } catch (error) {
      handleError(error);
    }
  });
