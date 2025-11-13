import { Command } from 'commander';
import { listCommand } from './list.js';
import { infoCommand } from './info.js';
import { tablesCommand } from './tables.js';
import { describeCommand } from './describe.js';
import { queryCommand } from './query.js';
import { sampleCommand } from './sample.js';
import { relationshipsCommand } from './relationships.js';
import { schemaExportCommand } from './schema-export.js';
import { schemaGraphCommand } from './schema-graph.js';
import { healthCommand } from './health.js';
import { connectionsCommand } from './connections.js';
import { cacheHitCommand } from './cache-hit.js';
import { locksCommand } from './locks.js';
import { slowQueriesCommand } from './slow-queries.js';
import { bloatCommand } from './bloat.js';
import { indexUsageCommand } from './index-usage.js';
import { dumpCommand } from './dump.js';
import { backupsListCommand } from './backups-list.js';
import { backupsInfoCommand } from './backups-info.js';

export const dbCommand = new Command('db')
  .description('数据库管理和监控')
  .addCommand(listCommand)
  .addCommand(infoCommand)
  .addCommand(tablesCommand)
  .addCommand(describeCommand)
  .addCommand(queryCommand)
  .addCommand(sampleCommand)
  .addCommand(relationshipsCommand)
  .addCommand(schemaExportCommand)
  .addCommand(schemaGraphCommand)
  .addCommand(healthCommand)
  .addCommand(connectionsCommand)
  .addCommand(cacheHitCommand)
  .addCommand(locksCommand)
  .addCommand(slowQueriesCommand)
  .addCommand(bloatCommand)
  .addCommand(indexUsageCommand)
  .addCommand(dumpCommand)
  .addCommand(backupsListCommand)
  .addCommand(backupsInfoCommand);
