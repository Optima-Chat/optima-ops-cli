import { Command } from 'commander';
import chalk from 'chalk';
import { getCurrentEnvironment, Environment } from '../../utils/config.js';
import { DatabaseClient } from '../../db/client.js';
import { getDatabasePassword } from '../../db/password.js';
import { handleError } from '../../utils/error.js';
import { isJsonOutput, outputSuccess, printTitle, createTable } from '../../utils/output.js';
import { selectPrompt } from '../../utils/prompt.js';

export const queryCommand = new Command('query')
  .description('执行只读 SQL 查询')
  .argument('[sql]', 'SQL 查询语句')
  .option('--database <name>', '数据库名称')
  .option('--env <env>', '环境 (production/stage/development)')
  .option('--json', 'JSON 格式输出')
  .action(async (sql, options) => {
    try {
      const env: Environment = options.env || getCurrentEnvironment();
      let database = options.database;

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

      if (!sql) {
        console.log(chalk.yellow('\\n⚠️  请提供 SQL 查询语句\\n'));
        console.log(chalk.gray('示例:'));
        console.log(chalk.gray('  optima-ops db query "SELECT * FROM users LIMIT 10"'));
        console.log(chalk.gray('  optima-ops db query "SELECT COUNT(*) FROM orders" --database optima_commerce\\n'));
        process.exit(1);
      }

      if (!isJsonOutput()) {
        printTitle(`📊 执行查询 - ${database}`);
        console.log(chalk.gray(`查询: ${sql.substring(0, 100)}${sql.length > 100 ? '...' : ''}\\n`));
      }

      const password = await getDatabasePassword(env, database);
      const client = new DatabaseClient(env, database, password);

      await client.connect();

      try {
        const result = await client.query(sql);

        if (isJsonOutput()) {
          outputSuccess({
            environment: env,
            database,
            query: sql,
            rows: result.rows,
            row_count: result.rowCount,
            execution_time: result.executionTime,
          });
        } else {
          if (result.rows.length === 0) {
            console.log(chalk.yellow('查询返回 0 行'));
          } else {
            // Create table from query results
            const columns = Object.keys(result.rows[0]);
            const table = createTable({
              head: columns,
            });

            for (const row of result.rows.slice(0, 100)) {
              table.push(columns.map(col => String(row[col] ?? '')));
            }

            console.log(table.toString());

            if (result.rows.length > 100) {
              console.log(chalk.gray(`\\n显示前 100 行（共 ${result.rowCount} 行）`));
            }
          }

          console.log(chalk.gray(`\\n执行时间: ${result.executionTime}ms`));
          console.log(chalk.gray(`返回行数: ${result.rowCount}\\n`));
        }
      } finally {
        await client.disconnect();
      }
    } catch (error) {
      handleError(error);
    }
  });
