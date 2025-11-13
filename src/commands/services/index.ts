import { Command } from 'commander';
import { healthCommand } from './health.js';

export const servicesCommand = new Command('services')
  .description('服务管理和监控')
  .addCommand(healthCommand);

// TODO: 添加其他命令
// .addCommand(statusCommand)
// .addCommand(logsCommand)
// .addCommand(inspectCommand)
// .addCommand(restartCommand);
