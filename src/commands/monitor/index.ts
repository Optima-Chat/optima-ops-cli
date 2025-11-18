import { Command } from 'commander';
import { dashboardCommand } from './dashboard.js';

export const monitorCommand = new Command('monitor')
  .description('Real-time monitoring dashboard for production services')
  .addCommand(dashboardCommand);
