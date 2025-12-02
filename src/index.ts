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
import { ecsCommand } from './commands/ecs/index.js';
import {
  getCurrentEnvironment,
  getCurrentEnvConfig,
  getEnvironments,
  getCurrentTargetEnvironment,
  setCurrentTargetEnvironment,
  isValidTargetEnvironment,
  type TargetEnvironment,
} from './utils/config.js';
import chalk from 'chalk';

const program = new Command();

program
  .name('optima-ops')
  .description('System operations and monitoring CLI for Optima')
  .version('1.0.0')
  .enablePositionalOptions()
  .passThroughOptions();

// 注册命令模块
program.addCommand(servicesCommand);  // 服务管理 (Phase 1)
program.addCommand(deployCommand);    // 部署管理 (Phase 1)
program.addCommand(dbCommand);        // 数据库管理 (Phase 2)
program.addCommand(infraCommand);     // 基础设施监控 (Phase 3)
program.addCommand(logsCommand);      // 日志分析 (Phase 4)
program.addCommand(configCommand);    // 配置管理 (Phase 5)
program.addCommand(validateCommand);  // 部署验证 (Phase 6)
program.addCommand(monitorCommand);   // 实时监控 TUI (Phase 7)
program.addCommand(ecsCommand);       // ECS 环境管理 (Phase 8)

// 环境管理命令组
const envCommand = new Command('env')
  .description('环境管理');

// env get - 显示当前环境
envCommand
  .command('get')
  .description('显示当前默认环境')
  .action(() => {
    const targetEnv = getCurrentTargetEnvironment();
    const legacyEnv = getCurrentEnvironment();

    console.log(chalk.cyan('\n当前环境配置:\n'));

    if (targetEnv) {
      const envs = getEnvironments();
      const envConfig = envs[targetEnv];
      console.log(chalk.white(`  目标环境: ${chalk.yellow(targetEnv)}`));
      console.log(chalk.white(`  类型: ${envConfig.type}`));
      console.log(chalk.white(`  域名: ${envConfig.domain}`));
      if (envConfig.host) {
        console.log(chalk.white(`  主机: ${envConfig.host}`));
      }
      if (envConfig.cluster) {
        console.log(chalk.white(`  集群: ${envConfig.cluster}`));
      }
    } else {
      console.log(chalk.yellow('  未设置默认目标环境'));
      console.log(chalk.gray('  使用 "optima-ops env set <env>" 设置默认环境'));
      console.log(chalk.gray('  或在命令中使用 --env 参数指定环境'));
    }

    console.log(chalk.gray(`\n  旧版环境: ${legacyEnv}`));
    console.log();
  });

// env set - 设置默认环境
envCommand
  .command('set <env>')
  .description('设置默认环境 (ec2-prod|ecs-stage|ecs-prod|bi-data)')
  .action((env: string) => {
    if (!isValidTargetEnvironment(env)) {
      console.log(chalk.red(`\n无效的环境: ${env}`));
      console.log(chalk.gray('可用环境: ec2-prod, ecs-stage, ecs-prod, bi-data\n'));
      process.exit(1);
    }

    setCurrentTargetEnvironment(env as TargetEnvironment);
    console.log(chalk.green(`\n✓ 默认环境已设置为: ${env}\n`));
  });

// env list - 列出所有可用环境
envCommand
  .command('list')
  .description('列出所有可用环境')
  .action(() => {
    const envs = getEnvironments();
    const currentEnv = getCurrentTargetEnvironment();

    console.log(chalk.cyan('\n可用环境:\n'));

    for (const [name, config] of Object.entries(envs)) {
      const isCurrent = name === currentEnv;
      const marker = isCurrent ? chalk.green('→ ') : '  ';
      const envName = isCurrent ? chalk.green(name) : chalk.white(name);

      console.log(`${marker}${envName.padEnd(20)} ${chalk.gray(config.type.padEnd(6))} ${config.domain}`);
      console.log(`    ${chalk.gray(config.description)}`);
    }

    console.log();
  });

program.addCommand(envCommand);

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
