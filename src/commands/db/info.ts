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
  printKeyValue,
} from '../../utils/output.js';
import { selectPrompt } from '../../utils/prompt.js';

export const infoCommand = new Command('info')
  .description('显示数据库详情')
  .argument('[database]', '数据库名称')
  .option('--env <env>', '环境 (production/stage/development)')
  .option('--json', 'JSON 格式输出')
  .action(async (database, options) => {
    try {
      const env: Environment = options.env || getCurrentEnvironment();

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
        printTitle(`📊 数据库详情 - ${database}`);
        console.log(chalk.gray('正在查询数据库信息...\\n'));
      }

      const password = await getDatabasePassword(env, database);
      const client = new DatabaseClient(env, database, password);

      await client.connect();

      try {
        const info = await client.getDatabaseInfo();

        if (isJsonOutput()) {
          outputSuccess({
            environment: env,
            ...info,
          });
        } else {
          printKeyValue('数据库名称', info.database);
          printKeyValue('数据库大小', info.size);
          printKeyValue('表数量', info.table_count.toString());
          printKeyValue('活跃连接数', info.active_connections.toString());
          console.log();
        }
      } finally {
        await client.disconnect();
      }
    } catch (error) {
      handleError(error);
    }
  });
