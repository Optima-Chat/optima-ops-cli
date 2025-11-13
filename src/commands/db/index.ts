import { Command } from 'commander';
import { listCommand } from './list.js';
import { infoCommand } from './info.js';
import { tablesCommand } from './tables.js';
import { describeCommand } from './describe.js';
import { queryCommand } from './query.js';
import { sampleCommand } from './sample.js';
import { healthCommand } from './health.js';

export const dbCommand = new Command('db')
  .description('数据库管理和监控')
  .addCommand(listCommand)
  .addCommand(infoCommand)
  .addCommand(tablesCommand)
  .addCommand(describeCommand)
  .addCommand(queryCommand)
  .addCommand(sampleCommand)
  .addCommand(healthCommand);
