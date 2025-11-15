import { Command } from 'commander';
import { preCommand } from './pre.js';

export const validateCommand = new Command('validate')
  .description('部署配置验证工具')
  .addCommand(preCommand);
