import { Command } from 'commander';
import chalk from 'chalk';
import { getCurrentEnvironment, Environment } from '../../utils/config.js';
import { DatabaseClient } from '../../db/client.js';
import { getDatabasePassword } from '../../db/password.js';
import { handleError } from '../../utils/error.js';
import { isJsonOutput, outputSuccess, printTitle, createTable } from '../../utils/output.js';
import { getSlowQueriesQuery } from '../../db/queries/health.js';

export const slowQueriesCommand = new Command('slow-queries')
  .description('显示正在运行的慢查询')
  .option('--database <name>', '数据库名称（默认 postgres）')
  .option('--env <env>', '环境 (production/stage/development)')
  .option('--threshold <seconds>', '慢查询阈值（秒）', '5')
  .option('--json', 'JSON 格式输出')
  .action(async (options) => {
    try {
      const env: Environment = options.env || getCurrentEnvironment();
      const database = options.database || 'postgres';
      const threshold = parseInt(options.threshold);

      if (!isJsonOutput()) {
        printTitle(`🐌 慢查询 - ${database}`);
        console.log(chalk.gray(`阈值: > ${threshold} 秒\\n`));
      }

      const password = await getDatabasePassword(env, database);
      const client = new DatabaseClient(env, database, password);

      await client.connect();

      try {
        const result = await client.query(getSlowQueriesQuery(threshold));

        if (isJsonOutput()) {
          outputSuccess({
            environment: env,
            database,
            threshold: `${threshold}s`,
            slow_queries: result.rows,
            count: result.rowCount,
          });
        } else {
          if (result.rowCount === 0) {
            console.log(chalk.green(`✓ 无慢查询（> ${threshold}s）\\n`));
          } else {
            console.log(
              chalk.yellow(`⚠️  检测到 ${result.rowCount} 个慢查询\\n`)
            );

            const table = createTable({
              head: ['PID', '用户', '数据库', '运行时间', '查询'],
            });

            for (const row of result.rows) {
              const duration = row.duration || {};
              const durationStr = duration.hours
                ? `${duration.hours}h ${duration.minutes}m`
                : duration.minutes
                ? `${duration.minutes}m ${duration.seconds}s`
                : `${duration.seconds}s`;

              const query = row.query || '';
              const queryShort =
                query.length > 60 ? query.substring(0, 60) + '...' : query;

              table.push([
                row.pid.toString(),
                row.usename,
                row.datname,
                durationStr,
                queryShort,
              ]);
            }

            console.log(table.toString());
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
