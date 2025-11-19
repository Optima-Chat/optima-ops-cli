import { Command } from 'commander';
import { dashboardBlessedCommand } from './dashboard-blessed.js';
import { dashboardCommand, startDashboard } from './dashboard.js';

export const monitorCommand = new Command('monitor')
  .description('Real-time monitoring dashboard for production services')
  .option('--env <environment>', 'Environment (production|stage)', 'production')
  .option('--interval <seconds>', 'Refresh interval (seconds)', '5')
  .action(startDashboard)
  .addCommand(dashboardCommand)
  .addCommand(dashboardBlessedCommand);
