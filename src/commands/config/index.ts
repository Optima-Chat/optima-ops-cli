import { Command } from 'commander';
import { getCommand } from './get.js';
import { listCommand } from './list.js';
import { showCommand } from './show.js';
import { compareCommand } from './compare.js';

export const configCommand = new Command('config')
  .description('配置参数管理（AWS Parameter Store）')
  .addCommand(getCommand)     // 获取单个参数
  .addCommand(listCommand)    // 列出所有参数
  .addCommand(showCommand)    // 显示所有参数值
  .addCommand(compareCommand); // 对比环境配置
