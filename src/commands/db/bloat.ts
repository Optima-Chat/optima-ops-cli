import { Command } from 'commander';
import chalk from 'chalk';
import { getCurrentEnvironment, Environment } from '../../utils/config.js';
import { DatabaseClient } from '../../db/client.js';
import { getDatabasePassword } from '../../db/password.js';
import { handleError } from '../../utils/error.js';
import { isJsonOutput, outputSuccess, printTitle, createTable } from '../../utils/output.js';
import { TABLE_BLOAT_QUERY } from '../../db/queries/health.js';

export const bloatCommand = new Command('bloat')
  .description('显示表膨胀情况（死元组）')
  .option('--database <name>', '数据库名称')
  .option('--env <env>', '环境 (production/stage/development)')
  .option('--threshold <percent>', '膨胀率阈值（%）', '20')
  .option('--json', 'JSON 格式输出')
  .action(async (options) => {
    try {
      const env: Environment = options.env || getCurrentEnvironment();
      const database = options.database || 'postgres';
      const threshold = parseFloat(options.threshold);

      if (!isJsonOutput()) {
        printTitle(`💾 表膨胀 - ${database}`);
        console.log(chalk.gray(`阈值: > ${threshold}%\\n`));
      }

      const password = await getDatabasePassword(env, database);
      const client = new DatabaseClient(env, database, password);

      await client.connect();

      try {
        const result = await client.query(TABLE_BLOAT_QUERY);

        // Filter by threshold if specified
        const bloatedTables = result.rows.filter(
          row => (row.bloat_pct || 0) > threshold
        );

        if (isJsonOutput()) {
          outputSuccess({
            environment: env,
            database,
            threshold: `${threshold}%`,
            tables: result.rows,
            bloated_tables: bloatedTables,
            count: result.rowCount,
          });
        } else {
          if (result.rowCount === 0) {
            console.log(chalk.green('✓ 所有表都没有死元组\\n'));
          } else {
            const table = createTable({
              head: ['表名', '活元组', '死元组', '膨胀率', '最后VACUUM'],
            });

            for (const row of result.rows) {
              const bloatPct = row.bloat_pct || 0;
              const bloatColor =
                bloatPct < 10
                  ? chalk.green
                  : bloatPct < 20
                  ? chalk.yellow
                  : chalk.red;

              table.push([
                row.table_name,
                row.live_tuples.toLocaleString(),
                row.dead_tuples.toLocaleString(),
                bloatColor(`${bloatPct}%`),
                row.last_vacuum
                  ? new Date(row.last_vacuum).toLocaleString('zh-CN')
                  : row.last_autovacuum
                  ? '自动: ' + new Date(row.last_autovacuum).toLocaleString('zh-CN')
                  : '从未',
              ]);
            }

            console.log(table.toString());

            if (bloatedTables.length > 0) {
              console.log();
              console.log(
                chalk.yellow(
                  `⚠️  ${bloatedTables.length} 个表膨胀率超过 ${threshold}%`
                )
              );
              console.log(chalk.gray('\\n建议: 考虑对膨胀率高的表执行 VACUUM'));
            } else {
              console.log();
              console.log(chalk.green('✓ 所有表膨胀率在正常范围内'));
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
