import { Command } from 'commander';
import { listCommand } from './list.js';
import { infoCommand } from './info.js';
import { tablesCommand } from './tables.js';
import { describeCommand } from './describe.js';
import { queryCommand } from './query.js';
import { sampleCommand } from './sample.js';
import { relationshipsCommand } from './relationships.js';
import { healthCommand } from './health.js';
import { connectionsCommand } from './connections.js';
import { cacheHitCommand } from './cache-hit.js';
import { locksCommand } from './locks.js';
import { slowQueriesCommand } from './slow-queries.js';
import { bloatCommand } from './bloat.js';
import { indexUsageCommand } from './index-usage.js';

export const dbCommand = new Command('db')
  .description('数据库管理和监控')
  .addCommand(listCommand)
  .addCommand(infoCommand)
  .addCommand(tablesCommand)
  .addCommand(describeCommand)
  .addCommand(queryCommand)
  .addCommand(sampleCommand)
  .addCommand(relationshipsCommand)
  .addCommand(healthCommand)
  .addCommand(connectionsCommand)
  .addCommand(cacheHitCommand)
  .addCommand(locksCommand)
  .addCommand(slowQueriesCommand)
  .addCommand(bloatCommand)
  .addCommand(indexUsageCommand);
