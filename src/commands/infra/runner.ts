import { Command } from 'commander';
import chalk from 'chalk';
import Table from 'cli-table3';
import { getCurrentEnvironment, getCurrentEnvConfig, Environment } from '../../utils/config.js';
import { SSHClient } from '../../utils/ssh.js';
import {
  isJsonOutput,
  outputSuccess,
  printTitle,
  printSection,
} from '../../utils/output.js';
import { handleError } from '../../utils/error.js';

interface RunnerInfo {
  environment: string;
  runner: {
    name: string;
    status: string;
    active_since?: string;
    version?: string;
    pid?: number;
    memory_usage?: string;
  };
  service: {
    unit_name: string;
    load_state: string;
    active_state: string;
    sub_state: string;
    main_pid?: number;
  };
  recent_jobs?: Array<{
    timestamp: string;
    job_id?: string;
    status?: string;
    repository?: string;
  }>;
  logs: string[];
}

export const runnerCommand = new Command('runner')
  .description('查看 GitHub Actions Runner 状态')
  .option('--env <env>', '环境 (production/stage/development)')
  .option('--json', 'JSON 格式输出')
  .option('--logs [lines]', '显示最近的日志行数（默认 20 行）', '20')
  .action(async (options) => {
    try {
      const env: Environment = options.env || getCurrentEnvironment();
      const envConfig = getCurrentEnvConfig();
      const logLines = parseInt(options.logs) || 20;

      if (!isJsonOutput()) {
        printTitle(`🏃 GitHub Actions Runner - ${env} 环境`);
      }

      const ssh = new SSHClient(env);
      await ssh.connect();

      const result: RunnerInfo = {
        environment: env,
        runner: {
          name: envConfig.githubRunner || 'unknown',
          status: 'unknown',
        },
        service: {
          unit_name: '',
          load_state: '',
          active_state: '',
          sub_state: '',
        },
        logs: [],
      };

      try {
        // 确定 runner 服务名
        const runnerServiceName = `actions.runner.Optima-Chat.${envConfig.githubRunner}.service`;
        result.service.unit_name = runnerServiceName;

        // 获取服务状态
        try {
          const statusResult = await ssh.executeCommand(`systemctl show ${runnerServiceName} --no-pager`);
          const statusLines = statusResult.stdout.trim().split('\n');

          for (const line of statusLines) {
            const [key, value] = line.split('=');
            if (!value) continue;

            switch (key) {
              case 'LoadState':
                result.service.load_state = value;
                break;
              case 'ActiveState':
                result.service.active_state = value;
                result.runner.status = value === 'active' ? 'running' : 'stopped';
                break;
              case 'SubState':
                result.service.sub_state = value;
                break;
              case 'MainPID':
                const pid = parseInt(value);
                if (pid > 0) {
                  result.service.main_pid = pid;
                  result.runner.pid = pid;
                }
                break;
              case 'ActiveEnterTimestamp':
                if (value && value !== '0') {
                  result.runner.active_since = value;
                }
                break;
            }
          }
        } catch (error) {
          // 服务状态获取失败
          result.runner.status = 'not_found';
        }

        // 获取 runner 版本（如果运行中）
        if (result.runner.status === 'running') {
          try {
            // 尝试从配置文件获取版本
            const versionResult = await ssh.executeCommand(
              `cat /opt/actions-runner/.runner 2>/dev/null | grep -o '"gitHubRunnerVersion":"[^"]*"' | cut -d'"' -f4 || echo ""`
            );
            if (versionResult.stdout.trim()) {
              result.runner.version = versionResult.stdout.trim();
            }
          } catch (error) {
            // 版本获取失败，忽略
          }

          // 获取进程内存使用
          if (result.runner.pid) {
            try {
              const memResult = await ssh.executeCommand(
                `ps -p ${result.runner.pid} -o rss= | awk '{print $1/1024 " MB"}'`
              );
              result.runner.memory_usage = memResult.stdout.trim();
            } catch (error) {
              // 内存信息获取失败
            }
          }
        }

        // 获取最近的日志
        try {
          const logsResult = await ssh.executeCommand(
            `journalctl -u ${runnerServiceName} -n ${logLines} --no-pager --output=short-iso`
          );
          result.logs = logsResult.stdout.trim().split('\n').filter(line => line.trim());
        } catch (error) {
          // 日志获取失败
          result.logs = ['日志获取失败'];
        }

        // 尝试解析最近的任务（从日志中）
        result.recent_jobs = [];
        for (const logLine of result.logs.slice(-10)) {
          // 查找运行任务的日志模式
          const runMatch = logLine.match(/Running job:\s*(.+)/i);
          if (runMatch) {
            result.recent_jobs.push({
              timestamp: logLine.split(' ')[0] || '',
              status: 'running',
            });
          }

          const completeMatch = logLine.match(/Job\s+(.+?)\s+completed/i);
          if (completeMatch) {
            result.recent_jobs.push({
              timestamp: logLine.split(' ')[0] || '',
              status: 'completed',
            });
          }
        }
      } catch (error: any) {
        throw new Error(`获取 Runner 信息失败: ${error.message}`);
      } finally {
        await ssh.disconnect();
      }

      // 输出结果
      if (isJsonOutput()) {
        outputSuccess(result);
      } else {
        // 显示 Runner 基本信息
        printSection('Runner 信息');
        const runnerTable = new Table({
          colWidths: [25, 50],
          wordWrap: true,
        });

        let statusDisplay = result.runner.status;
        if (result.runner.status === 'running') {
          statusDisplay = chalk.green('运行中');
        } else if (result.runner.status === 'stopped') {
          statusDisplay = chalk.red('已停止');
        } else if (result.runner.status === 'not_found') {
          statusDisplay = chalk.yellow('未找到');
        }

        runnerTable.push(
          ['Runner 名称', result.runner.name],
          ['状态', statusDisplay],
          ['服务名称', result.service.unit_name],
          ['版本', result.runner.version || 'N/A'],
          ['进程 ID', result.runner.pid ? result.runner.pid.toString() : 'N/A'],
          ['内存使用', result.runner.memory_usage || 'N/A'],
          [
            '运行时间',
            result.runner.active_since
              ? new Date(result.runner.active_since).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
              : 'N/A',
          ]
        );
        console.log(runnerTable.toString());

        // 显示服务详情
        printSection('Systemd 服务');
        const serviceTable = new Table({
          colWidths: [25, 50],
          wordWrap: true,
        });
        serviceTable.push(
          ['Load State', result.service.load_state],
          ['Active State', result.service.active_state],
          ['Sub State', result.service.sub_state],
          ['Main PID', result.service.main_pid ? result.service.main_pid.toString() : 'N/A']
        );
        console.log(serviceTable.toString());

        // 显示最近任务（如果有）
        if (result.recent_jobs && result.recent_jobs.length > 0) {
          printSection('最近任务');
          const jobsTable = new Table({
            head: ['时间', '状态'],
            colWidths: [30, 15],
          });
          for (const job of result.recent_jobs) {
            const statusDisplay =
              job.status === 'completed' ? chalk.green(job.status) : chalk.blue(job.status || 'unknown');
            jobsTable.push([job.timestamp, statusDisplay]);
          }
          console.log(jobsTable.toString());
        }

        // 显示日志
        if (result.logs && result.logs.length > 0) {
          printSection(`最近 ${logLines} 行日志`);
          for (const logLine of result.logs.slice(-logLines)) {
            // 高亮错误和警告
            if (logLine.toLowerCase().includes('error')) {
              console.log(chalk.red(logLine));
            } else if (logLine.toLowerCase().includes('warning')) {
              console.log(chalk.yellow(logLine));
            } else if (logLine.toLowerCase().includes('running job')) {
              console.log(chalk.cyan(logLine));
            } else {
              console.log(chalk.gray(logLine));
            }
          }
        }

        // 状态警告
        if (result.runner.status !== 'running') {
          console.log();
          console.log(chalk.red.bold('⚠️  Runner 未运行'));
          console.log(chalk.gray('排查步骤:'));
          console.log(chalk.gray(`  1. sudo systemctl status ${result.service.unit_name}`));
          console.log(chalk.gray(`  2. sudo systemctl start ${result.service.unit_name}`));
          console.log(chalk.gray(`  3. sudo journalctl -u ${result.service.unit_name} -n 50`));
        }

        // 提示
        console.log();
        console.log(chalk.gray('💡 提示:'));
        console.log(chalk.gray('  - 使用 --logs 50 查看更多日志'));
        console.log(chalk.gray('  - 使用 optima-ops deploy status <service> 查看部署历史'));
        console.log(chalk.gray('  - 使用 optima-ops deploy watch <service> 监控正在运行的部署'));
      }
    } catch (error) {
      handleError(error);
    }
  });
