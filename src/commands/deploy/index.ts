import { Command } from 'commander';
import { statusCommand } from './status.js';

export const deployCommand = new Command('deploy')
  .description('部署管理和监控')
  .addCommand(statusCommand);

// TODO: 添加其他命令
// .addCommand(watchCommand)
// .addCommand(listCommand)
// .addCommand(logsCommand)
// .addCommand(triggerCommand);
