import { Command } from 'commander';
import chalk from 'chalk';
import { getCurrentEnvironment, Environment } from '../../utils/config.js';
import { SSHClient } from '../../utils/ssh.js';
import { handleError } from '../../utils/error.js';
import { isJsonOutput, outputSuccess, printTitle, printKeyValue } from '../../utils/output.js';

export const backupsInfoCommand = new Command('backups-info')
  .description('显示备份详情')
  .argument('<backup-path>', '备份路径或名称')
  .option('--env <env>', '环境 (production/stage/development)')
  .option('--json', 'JSON 格式输出')
  .action(async (backupPath, options) => {
    try {
      const env: Environment = options.env || getCurrentEnvironment();

      if (!isJsonOutput()) {
        printTitle(`📋 备份详情 - ${backupPath}`);
        console.log(chalk.gray('正在查询备份信息...\\n'));
      }

      const ssh = new SSHClient(env);
      await ssh.connect();

      try {
        // Normalize backup path
        const fullPath = backupPath.startsWith('/opt/backups/')
          ? backupPath
          : `/opt/backups/${backupPath}`;

        // Get backup size
        const sizeCommand = `du -sh ${fullPath} | awk '{print $1}'`;
        const sizeResult = await ssh.executeCommand(sizeCommand, {
          validateSafety: false,
        });

        if (sizeResult.exitCode !== 0) {
          throw new Error(`备份不存在或无法访问: ${fullPath}`);
        }

        const size = sizeResult.stdout.trim();

        // Count files in backup
        const countCommand = `find ${fullPath} -type f | wc -l`;
        const countResult = await ssh.executeCommand(countCommand, {
          validateSafety: false,
        });

        const fileCount = countResult.stdout.trim();

        // Get creation time
        const timeCommand = `stat -c %y ${fullPath} | cut -d'.' -f1`;
        const timeResult = await ssh.executeCommand(timeCommand, {
          validateSafety: false,
        });

        const createdAt = timeResult.stdout.trim();

        if (isJsonOutput()) {
          outputSuccess({
            environment: env,
            backup_path: fullPath,
            size,
            file_count: parseInt(fileCount),
            created_at: createdAt,
          });
        } else {
          printKeyValue('备份路径', fullPath);
          printKeyValue('大小', size);
          printKeyValue('文件数', fileCount);
          printKeyValue('创建时间', createdAt);
          console.log();
        }
      } finally {
        ssh.disconnect();
      }
    } catch (error) {
      handleError(error);
    }
  });
