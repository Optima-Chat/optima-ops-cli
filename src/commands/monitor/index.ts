import { Command } from 'commander';
import { legacyDashboardCommand } from './dashboard-blessed.js';
import { dashboardCommand, startDashboard } from './dashboard.js';

export const monitorCommand = new Command('monitor')
  .description('多面板实时监控仪表盘（5个面板：概览、服务、EC2、Docker、蓝绿部署）')
  .option('--env <environment>', 'Environment (production|stage)', 'production')
  .option('--interval <seconds>', 'Refresh interval (seconds)', '5')
  .action(startDashboard)
  .addCommand(dashboardCommand)
  .addCommand(legacyDashboardCommand);
