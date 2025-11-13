import { Command } from 'commander';
import chalk from 'chalk';
import { getCurrentEnvironment, Environment } from '../../utils/config.js';
import { DatabaseClient } from '../../db/client.js';
import { getDatabasePassword } from '../../db/password.js';
import { handleError } from '../../utils/error.js';
import {
  isJsonOutput,
  outputSuccess,
  printTitle,
  createTable,
} from '../../utils/output.js';
import { selectPrompt } from '../../utils/prompt.js';

export const tablesCommand = new Command('tables')
  .description('列出数据库中的所有表')
  .option('--database <name>', '数据库名称')
  .option('--env <env>', '环境 (production/stage/development)')
  .option('--json', 'JSON 格式输出')
  .action(async (options) => {
    try {
      const env: Environment = options.env || getCurrentEnvironment();
      let database = options.database;

      // If database not specified, show selection prompt
      if (!database) {
        const password = await getDatabasePassword(env, 'postgres');
        const client = new DatabaseClient(env, 'postgres', password);
        await client.connect();

        try {
          const databases = await client.listDatabases();
          await client.disconnect();

          const choices = databases.map(db => ({
            name: `${db.name} (${db.size})`,
            value: db.name,
          }));

          database = await selectPrompt('选择数据库:', choices);
        } catch (error) {
          await client.disconnect();
          throw error;
        }
      }

      if (!isJsonOutput()) {
        printTitle(`📑 表列表 - ${database}`);
        console.log(chalk.gray('正在查询表信息...\\n'));
      }

      const password = await getDatabasePassword(env, database);
      const client = new DatabaseClient(env, database, password);

      await client.connect();

      try {
        const tables = await client.listTables();

        if (isJsonOutput()) {
          outputSuccess({
            environment: env,
            database,
            tables,
            total: tables.length,
          });
        } else {
          const table = createTable({
            head: ['表名', '大小', '行数', '最后 VACUUM'],
          });

          for (const t of tables) {
            table.push([
              t.name,
              t.size,
              t.rows.toLocaleString(),
              t.last_vacuum
                ? new Date(t.last_vacuum).toLocaleString('zh-CN')
                : '从未',
            ]);
          }

          console.log(table.toString());
          console.log(chalk.white(`\\n总计: ${tables.length} 个表\\n`));
        }
      } finally {
        await client.disconnect();
      }
    } catch (error) {
      handleError(error);
    }
  });
