import { Command } from 'commander';
import chalk from 'chalk';
import { getCurrentEnvironment, getCurrentEnvConfig, Environment } from '../../utils/config.js';
import { SSHClient } from '../../utils/ssh.js';
import { handleError } from '../../utils/error.js';
import { isJsonOutput, outputSuccess, printTitle } from '../../utils/output.js';
import { selectPrompt } from '../../utils/prompt.js';
import { DatabaseClient } from '../../db/client.js';
import { getDatabasePassword } from '../../db/password.js';
import * as fs from 'fs';

export const schemaExportCommand = new Command('schema-export')
  .description('导出数据库 schema（不含数据）')
  .option('--database <name>', '数据库名称')
  .option('--env <env>', '环境 (production/stage/development)')
  .option('--output <file>', '输出文件路径', 'schema.sql')
  .option('--json', 'JSON 格式输出')
  .action(async (options) => {
    try {
      const env: Environment = options.env || getCurrentEnvironment();
      let database = options.database;
      const outputFile = options.output;

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

      if (!isJsonOutput()) {
        printTitle(`📤 导出 Schema - ${database}`);
        console.log(chalk.gray('正在导出数据库结构...\\n'));
      }

      // Use SSH to execute pg_dump on EC2 (RDS is in VPC)
      const ssh = new SSHClient(env);
      await ssh.connect();

      try {
        // Get database password
        const password = await getDatabasePassword(env, database);
        const envConfig = getCurrentEnvConfig();

        // Execute pg_dump with schema-only option
        const command = `PGPASSWORD='${password}' pg_dump -h ${envConfig.rdsHost} -U ${getDatabaseUser(database)} -d ${database} --schema-only --no-owner --no-privileges`;

        const result = await ssh.executeCommand(command, {
          validateSafety: false,
          timeout: 60000,
        });

        if (result.exitCode !== 0) {
          throw new Error(`Schema 导出失败: ${result.stderr}`);
        }

        // Write to file
        fs.writeFileSync(outputFile, result.stdout);

        if (isJsonOutput()) {
          outputSuccess({
            environment: env,
            database,
            output_file: outputFile,
            size: result.stdout.length,
          });
        } else {
          console.log(chalk.green('✓ Schema 导出成功'));
          console.log(chalk.white(`  文件: ${outputFile}`));
          console.log(chalk.white(`  大小: ${(result.stdout.length / 1024).toFixed(2)} KB`));
          console.log();
        }
      } finally {
        ssh.disconnect();
      }
    } catch (error) {
      handleError(error);
    }
  });

function getDatabaseUser(database: string): string {
  const userMap: Record<string, string> = {
    optima_auth: 'auth_user',
    optima_mcp: 'mcp_user',
    optima_commerce: 'commerce_user',
    optima_chat: 'chat_user',
    optima_stage_auth: 'auth_user',
    optima_stage_mcp: 'mcp_user',
    optima_stage_commerce: 'commerce_user',
    optima_stage_chat: 'chat_user',
  };

  return userMap[database] || 'optima_admin';
}
