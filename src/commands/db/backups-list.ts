import { Command } from 'commander';
import chalk from 'chalk';
import { getCurrentEnvironment, Environment } from '../../utils/config.js';
import { SSHClient } from '../../utils/ssh.js';
import { handleError } from '../../utils/error.js';
import { isJsonOutput, outputSuccess, printTitle, createTable } from '../../utils/output.js';

export const backupsListCommand = new Command('backups-list')
  .description('列出 EC2 上的数据库备份')
  .option('--env <env>', '环境 (production/stage/development)')
  .option('--limit <number>', '限制数量', '20')
  .option('--json', 'JSON 格式输出')
  .action(async (options) => {
    try {
      const env: Environment = options.env || getCurrentEnvironment();
      const limit = parseInt(options.limit);

      if (!isJsonOutput()) {
        printTitle(`📦 数据库备份列表 - ${env} 环境`);
        console.log(chalk.gray('正在查询备份文件...\\n'));
      }

      const ssh = new SSHClient(env);
      await ssh.connect();

      try {
        // List backup directories in /opt/backups/
        const command = `ls -lt /opt/backups/ | grep '^d' | head -${limit}`;

        const result = await ssh.executeCommand(command, {
          validateSafety: false,
          timeout: 10000,
        });

        if (result.exitCode !== 0) {
          throw new Error(`查询备份失败: ${result.stderr}`);
        }

        // Parse ls output
        const lines = result.stdout.trim().split('\n').filter(l => l.trim());

        if (lines.length === 0) {
          if (isJsonOutput()) {
            outputSuccess({
              environment: env,
              backups: [],
              count: 0,
            });
          } else {
            console.log(chalk.yellow('未找到备份文件\\n'));
          }
          return;
        }

        const backups = lines.map(line => {
          const parts = line.split(/\s+/);
          return {
            name: parts[parts.length - 1],
            date: parts.slice(5, 8).join(' '),
          };
        });

        if (isJsonOutput()) {
          outputSuccess({
            environment: env,
            backups,
            count: backups.length,
          });
        } else {
          const table = createTable({
            head: ['备份名称', '创建时间'],
          });

          for (const backup of backups) {
            table.push([backup.name, backup.date]);
          }

          console.log(table.toString());
          console.log(chalk.white(`\\n总计: ${backups.length} 个备份\\n`));
        }
      } finally {
        ssh.disconnect();
      }
    } catch (error) {
      handleError(error);
    }
  });
