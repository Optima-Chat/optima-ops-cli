import { Command } from 'commander';
import chalk from 'chalk';
import { getCurrentEnvironment, Environment } from '../../utils/config.js';
import { DatabaseClient } from '../../db/client.js';
import { getDatabasePassword } from '../../db/password.js';
import { handleError } from '../../utils/error.js';
import { isJsonOutput, outputSuccess, printTitle, createTable } from '../../utils/output.js';
import { selectPrompt } from '../../utils/prompt.js';

export const sampleCommand = new Command('sample')
  .description('安全采样表数据')
  .argument('[table]', '表名')
  .option('--database <name>', '数据库名称')
  .option('--env <env>', '环境 (production/stage/development)')
  .option('--limit <number>', '限制行数', '100')
  .option('--json', 'JSON 格式输出')
  .action(async (tableName, options) => {
    try {
      const env: Environment = options.env || getCurrentEnvironment();
      let database = options.database;
      const limit = parseInt(options.limit);

      // Select database if not specified
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

      const password = await getDatabasePassword(env, database);
      const client = new DatabaseClient(env, database, password);
      await client.connect();

      try {
        // Select table if not specified
        if (!tableName) {
          const tables = await client.listTables();

          const choices = tables.map(t => ({
            name: `${t.name} (${t.size}, ${t.rows.toLocaleString()} 行)`,
            value: t.name,
          }));

          tableName = await selectPrompt('选择表:', choices);
        }

        if (!isJsonOutput()) {
          printTitle(`🔍 数据采样 - ${database}.${tableName}`);
          console.log(chalk.gray(`采样行数: ${limit}\\n`));
        }

        const rows = await client.sampleTable(tableName, limit);

        if (isJsonOutput()) {
          outputSuccess({
            environment: env,
            database,
            table: tableName,
            limit,
            rows,
            count: rows.length,
          });
        } else {
          if (rows.length === 0) {
            console.log(chalk.yellow('表为空或采样未返回结果'));
          } else {
            const columns = Object.keys(rows[0]);
            const table = createTable({
              head: columns,
            });

            for (const row of rows) {
              table.push(columns.map(col => String(row[col] ?? '')));
            }

            console.log(table.toString());
            console.log(chalk.gray(`\\n采样返回: ${rows.length} 行\\n`));
          }
        }
      } finally {
        await client.disconnect();
      }
    } catch (error) {
      handleError(error);
    }
  });
