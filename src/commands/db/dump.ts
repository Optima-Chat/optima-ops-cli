import { Command } from 'commander';
import chalk from 'chalk';
import { getCurrentEnvironment, getCurrentEnvConfig, Environment } from '../../utils/config.js';
import { SSHClient } from '../../utils/ssh.js';
import { getDatabasePassword } from '../../db/password.js';
import { handleError } from '../../utils/error.js';
import { isJsonOutput, outputSuccess, printTitle, printKeyValue } from '../../utils/output.js';
import { selectPrompt, confirmPrompt } from '../../utils/prompt.js';
import { DatabaseClient } from '../../db/client.js';

export const dumpCommand = new Command('dump')
  .description('备份数据库（需确认）')
  .argument('[database]', '数据库名称')
  .option('--env <env>', '环境 (production/stage/development)')
  .option('--output <path>', '输出路径', '/opt/backups')
  .option('--parallel <number>', '并行度', '4')
  .option('--compress <level>', '压缩级别 (zstd:1-9)', 'zstd:9')
  .option('--yes', '跳过确认')
  .option('--json', 'JSON 格式输出')
  .action(async (databaseArg, options) => {
    try {
      const env: Environment = options.env || getCurrentEnvironment();
      const parallel = parseInt(options.parallel);
      const compress = options.compress;
      const outputBase = options.output;

      // Select database if not specified
      let database = databaseArg;
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

          if (!database) {
            throw new Error('未选择数据库');
          }
        } catch (error) {
          await client.disconnect();
          throw error;
        }
      }

      // Ensure database is defined
      if (!database) {
        throw new Error('数据库名称未提供');
      }

      // Generate backup directory name with timestamp
      const now = new Date();
      const datePart = now.toISOString().replace(/[:.]/g, '-').split('T')[0];
      const timePart = now.toTimeString().split(' ')[0]?.replace(/:/g, '') || '';
      const timestamp = `${datePart}_${timePart}`;
      const outputPath = `${outputBase}/${database!}_${timestamp}`;

      if (!isJsonOutput()) {
        printTitle(`💾 数据库备份 - ${database}`);
        console.log();
        printKeyValue('数据库', database);
        printKeyValue('环境', env);
        printKeyValue('输出路径', outputPath);
        printKeyValue('并行度', parallel.toString());
        printKeyValue('压缩', compress);
        console.log();
      }

      // Confirm before proceeding
      if (!options.yes && !isJsonOutput()) {
        const confirmed = await confirmPrompt(
          `确定备份数据库 ${database} (${env}) 到 ${outputPath}?`
        );

        if (!confirmed) {
          console.log(chalk.yellow('\\n备份已取消\\n'));
          return;
        }
      }

      if (!isJsonOutput()) {
        console.log(chalk.cyan('\\n🚀 开始备份...\\n'));
      }

      const ssh = new SSHClient(env);
      await ssh.connect();

      try {
        // Get database password
        const password = await getDatabasePassword(env, database);
        const envConfig = getCurrentEnvConfig();
        const dbUser = getDatabaseUser(database);

        // Create backup directory
        await ssh.executeCommand(`mkdir -p ${outputPath}`, {
          validateSafety: false,
        });

        // Execute pg_dump with best practices
        // -Fd: directory format (most flexible)
        // -j: parallel workers
        // -Z: compression with zstd
        const dumpCommand = [
          `PGPASSWORD='${password}'`,
          `pg_dump`,
          `-h ${envConfig.rdsHost}`,
          `-U ${dbUser}`,
          `-d ${database}`,
          `-Fd`,  // Directory format
          `-j ${parallel}`,  // Parallel
          `-Z ${compress}`,  // Compression
          `--no-owner`,
          `--no-privileges`,
          `-f ${outputPath}`,
        ].join(' ');

        const startTime = Date.now();

        const result = await ssh.executeCommand(dumpCommand, {
          validateSafety: false,
          timeout: 600000, // 10 minutes
        });

        const duration = Date.now() - startTime;

        if (result.exitCode !== 0) {
          throw new Error(`备份失败: ${result.stderr}`);
        }

        // Get backup size
        const sizeCommand = `du -sh ${outputPath} | awk '{print $1}'`;
        const sizeResult = await ssh.executeCommand(sizeCommand, {
          validateSafety: false,
        });

        const backupSize = sizeResult.stdout.trim();

        if (isJsonOutput()) {
          outputSuccess({
            environment: env,
            database,
            backup_path: outputPath,
            size: backupSize,
            parallel,
            compression: compress,
            duration_ms: duration,
          });
        } else {
          console.log(chalk.green('\\n✓ 备份完成！\\n'));
          printKeyValue('备份位置', outputPath);
          printKeyValue('大小', backupSize);
          printKeyValue('耗时', `${(duration / 1000).toFixed(1)}s`);
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
