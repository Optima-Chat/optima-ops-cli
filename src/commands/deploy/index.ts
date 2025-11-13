import { Command } from 'commander';
import { statusCommand } from './status.js';
import { watchCommand } from './watch.js';
import { listCommand } from './list.js';
import { logsCommand } from './logs.js';
import { triggerCommand } from './trigger.js';

export const deployCommand = new Command('deploy')
  .description('部署管理和监控')
  .addCommand(statusCommand)
  .addCommand(watchCommand)
  .addCommand(listCommand)
  .addCommand(logsCommand)
  .addCommand(triggerCommand);
