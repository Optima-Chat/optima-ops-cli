import { Command } from 'commander';
import chalk from 'chalk';
import { getCurrentEnvironment, Environment } from '../../utils/config.js';
import { DatabaseClient } from '../../db/client.js';
import { getDatabasePassword } from '../../db/password.js';
import { handleError } from '../../utils/error.js';
import { isJsonOutput, outputSuccess, printTitle, createTable } from '../../utils/output.js';
import { INDEX_USAGE_QUERY, UNUSED_INDEXES_QUERY } from '../../db/queries/health.js';

export const indexUsageCommand = new Command('index-usage')
  .description('显示索引使用统计')
  .option('--database <name>', '数据库名称')
  .option('--env <env>', '环境 (production/stage/development)')
  .option('--show-unused', '只显示未使用的索引')
  .option('--json', 'JSON 格式输出')
  .action(async (options) => {
    try {
      const env: Environment = options.env || getCurrentEnvironment();
      const database = options.database || 'postgres';

      if (!isJsonOutput()) {
        printTitle(`📑 索引使用统计 - ${database}`);
        console.log(chalk.gray('正在查询索引信息...\\n'));
      }

      const password = await getDatabasePassword(env, database);
      const client = new DatabaseClient(env, database, password);

      await client.connect();

      try {
        if (options.showUnused) {
          // Show only unused indexes
          const result = await client.query(UNUSED_INDEXES_QUERY);

          if (isJsonOutput()) {
            outputSuccess({
              environment: env,
              database,
              unused_indexes: result.rows,
              count: result.rowCount,
            });
          } else {
            if (result.rowCount === 0) {
              console.log(chalk.green('✓ 所有索引都有被使用\\n'));
            } else {
              console.log(
                chalk.yellow(
                  `⚠️  发现 ${result.rowCount} 个未使用的索引\\n`
                )
              );

              const table = createTable({
                head: ['表名', '索引名', '大小', '扫描次数'],
              });

              for (const row of result.rows) {
                table.push([
                  row.table_name,
                  row.index_name,
                  row.index_size,
                  row.idx_scan.toString(),
                ]);
              }

              console.log(table.toString());
              console.log();
              console.log(chalk.gray('💡 建议: 考虑删除未使用的索引以节省空间和提升写入性能'));
              console.log();
            }
          }
        } else {
          // Show all indexes
          const result = await client.query(INDEX_USAGE_QUERY);

          if (isJsonOutput()) {
            outputSuccess({
              environment: env,
              database,
              indexes: result.rows,
              count: result.rowCount,
            });
          } else {
            const table = createTable({
              head: ['表名', '索引名', '扫描次数', '读取行数', '大小'],
            });

            for (const row of result.rows.slice(0, 30)) {
              const scanColor =
                row.idx_scan === 0
                  ? chalk.red
                  : row.idx_scan < 100
                  ? chalk.yellow
                  : chalk.green;

              table.push([
                row.table_name,
                row.index_name,
                scanColor(row.idx_scan.toLocaleString()),
                row.idx_tup_read.toLocaleString(),
                row.index_size,
              ]);
            }

            console.log(table.toString());

            if (result.rowCount > 30) {
              console.log(
                chalk.gray(`\\n(显示前 30 个，共 ${result.rowCount} 个)`)
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
