#!/usr/bin/env node

/**
 * @optima-chat/ops-cli
 * System operations and monitoring CLI for Optima
 */

import { Command } from 'commander';
import { servicesCommand } from './commands/services/index.js';
import { deployCommand } from './commands/deploy/index.js';
import { dbCommand } from './commands/db/index.js';
import { infraCommand } from './commands/infra/index.js';
import { logsCommand } from './commands/logs/index.js';
import { configCommand } from './commands/config/index.js';
import { validateCommand } from './commands/validate/index.js';
import { monitorCommand } from './commands/monitor/index.js';
import { getCurrentEnvironment, getCurrentEnvConfig } from './utils/config.js';
import chalk from 'chalk';

const program = new Command();

program
  .name('optima-ops')
  .description('System operations and monitoring CLI for Optima')
  .version('1.0.0')
  .option('--env <env>', '设置环境 (production/stage/development)');

// 注册命令模块
program.addCommand(servicesCommand);  // 服务管理 (Phase 1)
program.addCommand(deployCommand);    // 部署管理 (Phase 1)
program.addCommand(dbCommand);        // 数据库管理 (Phase 2)
program.addCommand(infraCommand);     // 基础设施监控 (Phase 3)
program.addCommand(logsCommand);      // 日志分析 (Phase 4)
program.addCommand(configCommand);    // 配置管理 (Phase 5)
program.addCommand(validateCommand);  // 部署验证 (Phase 6)
program.addCommand(monitorCommand);   // 实时监控 TUI (Phase 7)

// 显示环境信息
program
  .command('env')
  .description('显示当前环境信息')
  .action(() => {
    const env = getCurrentEnvironment();
    const config = getCurrentEnvConfig();

    console.log(chalk.cyan('\n当前环境配置:\n'));
    console.log(chalk.white(`  环境: ${chalk.yellow(env)}`));
    console.log(chalk.white(`  EC2 主机: ${config.ec2Host}`));
    console.log(chalk.white(`  RDS 主机: ${config.rdsHost}`));
    console.log(chalk.white(`  服务列表: ${config.services.join(', ')}`));
    console.log();
  });

// 版本信息
program
  .command('version')
  .description('显示版本信息')
  .option('--json', 'JSON 格式输出')
  .action((options) => {
    const data = {
      name: '@optima-chat/ops-cli',
      version: '1.0.0',
      description: 'System operations and monitoring CLI',
      environment: getCurrentEnvironment(),
    };

    if (options.json || process.env.OPTIMA_OUTPUT === 'json') {
      console.log(JSON.stringify({ success: true, data }, null, 2));
    } else {
      console.log(chalk.cyan('\nOptima Ops CLI\n'));
      console.log(chalk.white(`  版本: ${chalk.yellow(data.version)}`));
      console.log(chalk.white(`  环境: ${chalk.yellow(data.environment)}`));
      console.log();
    }
  });

// 默认行为：无参数时启动监控界面
const args = process.argv.slice(2);
const hasCommand = args.length > 0 && !args[0]?.startsWith('--');

if (!hasCommand) {
  // 无命令参数，启动监控界面
  process.argv = ['node', 'optima-ops', 'monitor', 'dashboard-blessed'];
}

program.parse();
