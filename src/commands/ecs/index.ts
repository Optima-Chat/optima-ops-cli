import { Command } from 'commander';
import { servicesCommand } from './services.js';
import { clusterCommand } from './cluster.js';
import { tasksCommand } from './tasks.js';
import { metricsCommand } from './metrics.js';

export const ecsCommand = new Command('ecs')
  .description('ECS 环境管理命令')
  .addCommand(servicesCommand)
  .addCommand(clusterCommand)
  .addCommand(tasksCommand)
  .addCommand(metricsCommand);
