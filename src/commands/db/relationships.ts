import { Command } from 'commander';
import chalk from 'chalk';
import { getCurrentEnvironment, Environment } from '../../utils/config.js';
import { DatabaseClient } from '../../db/client.js';
import { getDatabasePassword } from '../../db/password.js';
import { handleError } from '../../utils/error.js';
import { isJsonOutput, outputSuccess, printTitle } from '../../utils/output.js';
import { selectPrompt } from '../../utils/prompt.js';

export const relationshipsCommand = new Command('relationships')
  .description('显示表的外键关系')
  .argument('[table]', '表名')
  .option('--database <name>', '数据库名称')
  .option('--env <env>', '环境 (production/stage/development)')
  .option('--json', 'JSON 格式输出')
  .action(async (tableName, options) => {
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
          printTitle(`🔗 表关系 - ${database}.${tableName}`);
          console.log(chalk.gray('正在查询外键关系...\\n'));
        }

        const relationships = await client.getTableRelationships(tableName);

        if (isJsonOutput()) {
          outputSuccess({
            environment: env,
            database,
            table: tableName,
            ...relationships,
          });
        } else {
          // Print dependencies (tables this table depends on)
          console.log(chalk.cyan('上游依赖 (此表依赖的表):'));
          if (relationships.dependencies.length === 0) {
            console.log(chalk.gray('  无'));
          } else {
            relationships.dependencies.forEach(dep => {
              console.log(chalk.white(`  • ${tableName}`) + chalk.gray(` → `) + chalk.yellow(dep));
            });
          }

          console.log();

          // Print dependents (tables that depend on this table)
          console.log(chalk.cyan('下游依赖 (依赖此表的表):'));
          if (relationships.dependents.length === 0) {
            console.log(chalk.gray('  无'));
          } else {
            relationships.dependents.forEach(dep => {
              console.log(chalk.yellow(`  • ${dep}`) + chalk.gray(` → `) + chalk.white(tableName));
            });
          }

          console.log();
        }
      } finally {
        await client.disconnect();
      }
    } catch (error) {
      handleError(error);
    }
  });
