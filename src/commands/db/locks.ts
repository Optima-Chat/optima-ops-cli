import { Command } from 'commander';
import chalk from 'chalk';
import { getCurrentEnvironment, Environment } from '../../utils/config.js';
import { DatabaseClient } from '../../db/client.js';
import { getDatabasePassword } from '../../db/password.js';
import { handleError } from '../../utils/error.js';
import { isJsonOutput, outputSuccess, printTitle, createTable } from '../../utils/output.js';
import { LOCKS_QUERY, BLOCKING_QUERIES_QUERY } from '../../db/queries/health.js';

export const locksCommand = new Command('locks')
  .description('显示数据库锁和阻塞情况')
  .option('--database <name>', '数据库名称（默认 postgres）')
  .option('--env <env>', '环境 (production/stage/development)')
  .option('--show-blocking', '显示阻塞查询详情')
  .option('--json', 'JSON 格式输出')
  .action(async (options) => {
    try {
      const env: Environment = options.env || getCurrentEnvironment();
      const database = options.database || 'postgres';

      if (!isJsonOutput()) {
        printTitle(`🔒 数据库锁 - ${database}`);
        console.log(chalk.gray('正在查询锁信息...\\n'));
      }

      const password = await getDatabasePassword(env, database);
      const client = new DatabaseClient(env, database, password);

      await client.connect();

      try {
        // Get active locks
        const locksResult = await client.query(LOCKS_QUERY);

        if (options.showBlocking) {
          // Get blocking queries
          const blockingResult = await client.query(BLOCKING_QUERIES_QUERY);

          if (isJsonOutput()) {
            outputSuccess({
              environment: env,
              database,
              locks: locksResult.rows,
              blocking_queries: blockingResult.rows,
            });
          } else {
            console.log(chalk.cyan(`活跃锁: ${locksResult.rowCount} 个\\n`));

            if (blockingResult.rowCount > 0) {
              console.log(chalk.red(`⚠️  检测到 ${blockingResult.rowCount} 个阻塞查询\\n`));

              const table = createTable({
                head: ['被阻塞PID', '被阻塞用户', '阻塞PID', '阻塞用户'],
              });

              for (const row of blockingResult.rows) {
                table.push([
                  row.blocked_pid.toString(),
                  row.blocked_user,
                  row.blocking_pid.toString(),
                  row.blocking_user,
                ]);
              }

              console.log(table.toString());
              console.log();
            } else {
              console.log(chalk.green('✓ 无阻塞查询\\n'));
            }
          }
        } else {
          if (isJsonOutput()) {
            outputSuccess({
              environment: env,
              database,
              locks: locksResult.rows,
              count: locksResult.rowCount,
            });
          } else {
            if (locksResult.rowCount === 0) {
              console.log(chalk.green('✓ 无活跃锁\\n'));
            } else {
              console.log(chalk.yellow(`⚠️  检测到 ${locksResult.rowCount} 个活跃锁\\n`));

              const table = createTable({
                head: ['类型', '关系', '模式', '已授予', 'PID'],
              });

              for (const row of locksResult.rows.slice(0, 20)) {
                table.push([
                  row.locktype,
                  row.relation ? row.relation.toString() : '-',
                  row.mode,
                  row.granted ? 'Y' : 'N',
                  row.pid.toString(),
                ]);
              }

              console.log(table.toString());

              if (locksResult.rowCount > 20) {
                console.log(
                  chalk.gray(`\\n(显示前 20 个，共 ${locksResult.rowCount} 个)`)
                );
              }

              console.log();
            }
          }
        }
      } finally {
        await client.disconnect();
      }
    } catch (error) {
      handleError(error);
    }
  });
