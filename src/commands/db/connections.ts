import { Command } from 'commander';
import chalk from 'chalk';
import { getCurrentEnvironment, Environment } from '../../utils/config.js';
import { DatabaseClient } from '../../db/client.js';
import { getDatabasePassword } from '../../db/password.js';
import { handleError } from '../../utils/error.js';
import { isJsonOutput, outputSuccess, printTitle, createTable } from '../../utils/output.js';
import { CONNECTIONS_QUERY, CONNECTION_LIMITS_QUERY } from '../../db/queries/health.js';

export const connectionsCommand = new Command('connections')
  .description('显示数据库连接详情')
  .option('--database <name>', '数据库名称（默认 postgres）')
  .option('--env <env>', '环境 (production/stage/development)')
  .option('--json', 'JSON 格式输出')
  .action(async (options) => {
    try {
      const env: Environment = options.env || getCurrentEnvironment();
      const database = options.database || 'postgres';

      if (!isJsonOutput()) {
        printTitle(`🔌 数据库连接 - ${env} 环境`);
        console.log(chalk.gray('正在查询连接信息...\\n'));
      }

      const password = await getDatabasePassword(env, database);
      const client = new DatabaseClient(env, database, password);

      await client.connect();

      try {
        // Get connection limits
        const limitsResult = await client.query<{
          current_connections: number;
          max_connections: number;
          usage_pct: number;
        }>(CONNECTION_LIMITS_QUERY);

        const limits = limitsResult.rows[0];
        if (!limits) {
          throw new Error('无法获取连接限制信息');
        }

        // Get connection details grouped by database/user/state
        const connectionsResult = await client.query(CONNECTIONS_QUERY);

        if (isJsonOutput()) {
          outputSuccess({
            environment: env,
            limits: {
              current: limits.current_connections,
              max: limits.max_connections,
              usage_pct: limits.usage_pct,
            },
            connections: connectionsResult.rows,
          });
        } else {
          // Print limits
          console.log(chalk.cyan('连接限制:'));
          console.log(
            chalk.white(
              `  当前/最大: ${limits.current_connections}/${limits.max_connections} (${limits.usage_pct}%)`
            )
          );

          const statusColor =
            limits.usage_pct < 80
              ? chalk.green
              : limits.usage_pct < 90
              ? chalk.yellow
              : chalk.red;

          console.log(
            chalk.white('  状态: ') +
              statusColor(
                limits.usage_pct < 80
                  ? '正常'
                  : limits.usage_pct < 90
                  ? '警告'
                  : '危险'
              )
          );

          console.log();

          // Print connection details
          console.log(chalk.cyan('活跃连接:'));
          const table = createTable({
            head: ['数据库', '用户', '状态', '数量'],
          });

          for (const conn of connectionsResult.rows) {
            table.push([
              conn.database,
              conn.user,
              conn.state || 'unknown',
              conn.count.toString(),
            ]);
          }

          console.log(table.toString());
          console.log();
        }
      } finally {
        await client.disconnect();
      }
    } catch (error) {
      handleError(error);
    }
  });
