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

export const describeCommand = new Command('describe')
  .description('显示表结构（列、索引、外键）')
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
          printTitle(`📋 表结构 - ${database}.${tableName}`);
          console.log(chalk.gray('正在查询表结构...\\n'));
        }

        const structure = await client.describeTable(tableName);

        if (isJsonOutput()) {
          outputSuccess({
            environment: env,
            database,
            table: tableName,
            ...structure,
          });
        } else {
          // Print columns
          console.log(chalk.cyan('\\n列信息:'));
          const columnsTable = createTable({
            head: ['列名', '类型', '可为空', '默认值'],
          });

          for (const col of structure.columns) {
            columnsTable.push([
              col.column_name,
              col.data_type +
                (col.character_maximum_length
                  ? `(${col.character_maximum_length})`
                  : ''),
              col.is_nullable === 'YES' ? 'YES' : 'NO',
              col.column_default || '-',
            ]);
          }

          console.log(columnsTable.toString());

          // Print indexes
          if (structure.indexes.length > 0) {
            console.log(chalk.cyan('\\n索引:'));
            for (const idx of structure.indexes) {
              console.log(
                chalk.white(`  ${idx.indexname}`) +
                  chalk.gray(` (${idx.size})`)
              );
              console.log(chalk.gray(`    ${idx.indexdef}`));
            }
          }

          // Print foreign keys
          if (structure.foreign_keys.length > 0) {
            console.log(chalk.cyan('\\n外键:'));
            for (const fk of structure.foreign_keys) {
              console.log(
                chalk.white(`  ${fk.constraint_name}:`) +
                  chalk.gray(
                    ` ${fk.column_name} → ${fk.foreign_table_name}(${fk.foreign_column_name})`
                  )
              );
            }
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
