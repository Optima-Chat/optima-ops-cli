import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'fs/promises';
import path from 'path';
import { getCurrentEnvironment, getCurrentEnvConfig, Environment } from '../../utils/config.js';
import { SSHClient } from '../../utils/ssh.js';
import { PromptHelper } from '../../utils/prompt.js';
import {
  isJsonOutput,
  outputSuccess,
  printTitle,
} from '../../utils/output.js';
import { handleError } from '../../utils/error.js';

interface ExportResult {
  environment: string;
  service: string;
  output_file: string;
  lines_exported: number;
  file_size: string;
  since?: string;
}

export const exportCommand = new Command('export')
  .description('导出容器日志到本地文件')
  .argument('[service]', '服务名称')
  .option('--env <env>', '环境 (production/stage/development)')
  .option('--output <file>', '输出文件路径（默认: logs/<service>-<timestamp>.log）')
  .option('--since <time>', '时间范围 (如: 1h, 30m, 2d)', '24h')
  .option('--tail <lines>', '只导出最后 N 行（不指定则导出全部）')
  .option('--format <format>', '输出格式 (text/json)', 'text')
  .option('--json', 'JSON 格式输出命令结果（不影响日志内容格式）')
  .action(async (service, options) => {
    try {
      const env: Environment = options.env || getCurrentEnvironment();
      const envConfig = getCurrentEnvConfig();

      // 交互式选择服务
      let targetService = service;
      if (!targetService && !isJsonOutput()) {
        targetService = await PromptHelper.selectService(
          Array.from(envConfig.services),
          '选择要导出日志的服务:'
        );
      } else if (!targetService) {
        throw new Error('请指定服务名称: logs export <service>');
      }

      // 生成默认输出文件名
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
      const defaultOutputFile = path.join(
        process.cwd(),
        'logs',
        `${targetService}-${env}-${timestamp}.log`
      );

      let outputFile = options.output || defaultOutputFile;

      // 如果没有指定输出路径，需要确保 logs 目录存在
      if (!options.output) {
        await fs.mkdir(path.dirname(outputFile), { recursive: true });
      }

      if (!isJsonOutput()) {
        printTitle(`💾 导出日志 - ${targetService} (${env} 环境)`);
        console.log(chalk.gray(`时间范围: ${options.since}`));
        console.log(chalk.gray(`输出文件: ${outputFile}`));
        console.log();
      }

      const ssh = new SSHClient(env);
      await ssh.connect();

      const result: ExportResult = {
        environment: env,
        service: targetService,
        output_file: outputFile,
        lines_exported: 0,
        file_size: '0 B',
        since: options.since,
      };

      try {
        const containerName = env === 'production'
          ? `optima-${targetService}-prod`
          : env === 'stage'
          ? `optima-${targetService}-stage`
          : `optima-${targetService}-dev`;

        // 构建 docker logs 命令
        let logsCommand = `docker logs ${containerName} --since ${options.since} 2>&1`;

        if (options.tail) {
          logsCommand += ` --tail ${options.tail}`;
        }

        const logsResult = await ssh.executeCommand(logsCommand);

        if (!logsResult.stdout.trim()) {
          throw new Error('没有日志可导出');
        }

        const logLines = logsResult.stdout.trim().split('\n');
        result.lines_exported = logLines.length;

        // 根据格式写入文件
        if (options.format === 'json') {
          // JSON 格式：每行日志作为一个对象
          const jsonLogs = logLines.map((line, index) => {
            // 尝试解析时间戳和级别
            const timestampMatch = line.match(/(\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2})/);
            const levelMatch = line.match(/\b(ERROR|CRITICAL|WARNING|WARN|INFO|DEBUG)\b/i);

            return {
              line_number: index + 1,
              timestamp: timestampMatch && timestampMatch[1] ? timestampMatch[1] : null,
              level: levelMatch && levelMatch[1] ? levelMatch[1].toUpperCase() : 'UNKNOWN',
              message: line,
            };
          });

          const jsonContent = JSON.stringify({
            service: targetService,
            environment: env,
            exported_at: new Date().toISOString(),
            since: options.since,
            total_lines: jsonLogs.length,
            logs: jsonLogs,
          }, null, 2);

          await fs.writeFile(outputFile, jsonContent, 'utf-8');
        } else {
          // Text 格式：原始日志
          const header = [
            `# Optima Ops CLI - Log Export`,
            `# Service: ${targetService}`,
            `# Environment: ${env}`,
            `# Exported at: ${new Date().toISOString()}`,
            `# Since: ${options.since}`,
            `# Total lines: ${logLines.length}`,
            `# ────────────────────────────────────────────────────────────────`,
            '',
          ].join('\n');

          await fs.writeFile(outputFile, header + logsResult.stdout, 'utf-8');
        }

        // 获取文件大小
        const stats = await fs.stat(outputFile);
        const fileSizeKB = (stats.size / 1024).toFixed(2);
        const fileSizeMB = (stats.size / 1024 / 1024).toFixed(2);

        if (stats.size < 1024 * 1024) {
          result.file_size = `${fileSizeKB} KB`;
        } else {
          result.file_size = `${fileSizeMB} MB`;
        }

        // 输出结果
        if (isJsonOutput()) {
          outputSuccess(result);
        } else {
          console.log(chalk.green('✓ 日志导出成功!\n'));
          console.log(chalk.cyan('导出信息:'));
          console.log(chalk.gray(`  文件: ${result.output_file}`));
          console.log(chalk.gray(`  行数: ${result.lines_exported.toLocaleString()}`));
          console.log(chalk.gray(`  大小: ${result.file_size}`));
          console.log(chalk.gray(`  格式: ${options.format}`));

          console.log();
          console.log(chalk.gray('💡 提示:'));
          console.log(chalk.gray('  - 使用 --format json 导出为 JSON 格式'));
          console.log(chalk.gray('  - 使用 --tail 1000 只导出最后 1000 行'));
          console.log(chalk.gray('  - 使用 --since 7d 导出最近 7 天的日志'));
          console.log(chalk.gray(`  - 查看文件: cat ${result.output_file}`));
        }
      } finally {
        await ssh.disconnect();
      }
    } catch (error) {
      handleError(error);
    }
  });
