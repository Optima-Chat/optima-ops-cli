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

export const listCommand = new Command('list')
  .description('列出所有数据库')
  .option('--env <env>', '环境 (production/stage/development)')
  .option('--json', 'JSON 格式输出')
  .action(async (options) => {
    try {
      const env: Environment = options.env || getCurrentEnvironment();

      if (!isJsonOutput()) {
        printTitle(`📋 数据库列表 - ${env} 环境`);
        console.log(chalk.gray('正在连接数据库...\\n'));
      }

      // Connect to postgres database to list all databases
      const password = await getDatabasePassword(env, 'postgres');
      const client = new DatabaseClient(env, 'postgres', password);

      await client.connect();

      try {
        const databases = await client.listDatabases();

        if (isJsonOutput()) {
          outputSuccess({
            environment: env,
            databases,
            total: databases.length,
          });
        } else {
          const table = createTable({
            head: ['数据库', '大小', '所有者'],
          });

          for (const db of databases) {
            table.push([db.name, db.size, db.owner]);
          }

          console.log(table.toString());
          console.log(chalk.white(`\\n总计: ${databases.length} 个数据库\\n`));
        }
      } finally {
        await client.disconnect();
      }
    } catch (error) {
      handleError(error);
    }
  });
