import { Command } from 'commander';
import { healthCommand } from './health.js';
import { statusCommand } from './status.js';
import { logsCommand } from './logs.js';
import { inspectCommand } from './inspect.js';
import { restartCommand } from './restart.js';

export const servicesCommand = new Command('services')
  .description('服务管理和监控')
  .addCommand(healthCommand)
  .addCommand(statusCommand)
  .addCommand(logsCommand)
  .addCommand(inspectCommand)
  .addCommand(restartCommand);
