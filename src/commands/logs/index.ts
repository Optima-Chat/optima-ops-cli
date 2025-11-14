import { Command } from 'commander';
import { searchCommand } from './search.js';
import { errorsCommand } from './errors.js';
import { tailCommand } from './tail.js';
import { exportCommand } from './export.js';

export const logsCommand = new Command('logs')
  .description('日志查看和分析工具')
  .addCommand(searchCommand)  // 搜索日志
  .addCommand(errorsCommand)  // 查看错误日志
  .addCommand(tailCommand)    // 查看日志尾部
  .addCommand(exportCommand); // 导出日志
