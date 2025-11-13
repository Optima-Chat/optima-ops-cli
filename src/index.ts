#!/usr/bin/env node

/**
 * @optima-chat/ops-cli
 * System operations and monitoring CLI for Optima
 */

import { Command } from 'commander';
import { servicesCommand } from './commands/services/index.js';
import { deployCommand } from './commands/deploy/index.js';
import { getCurrentEnvironment, getCurrentEnvConfig } from './utils/config.js';
import chalk from 'chalk';

const program = new Command();

program
  .name('optima-ops')
  .description('System operations and monitoring CLI for Optima')
  .version('1.0.0')
  .option('--env <env>', '设置环境 (production/stage/development)');

// 注册命令模块
program.addCommand(servicesCommand);  // 服务管理
program.addCommand(deployCommand);    // 部署管理

// TODO: 添加更多模块
// program.addCommand(databaseCommand);  // 数据库监控
// program.addCommand(infraCommand);     // 基础设施监控
// program.addCommand(logsCommand);      // 日志分析
// program.addCommand(configCommand);    // 配置管理

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
  .action(() => {
    console.log(JSON.stringify({
      success: true,
      data: {
        name: '@optima-chat/ops-cli',
        version: '1.0.0',
        description: 'System operations and monitoring CLI',
        environment: getCurrentEnvironment(),
      }
    }, null, 2));
  });

program.parse();
