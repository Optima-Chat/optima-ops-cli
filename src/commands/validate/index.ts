import { Command } from 'commander';
import { specCommand } from './spec.js';
import { preCommand } from './pre.js';
import { postCommand } from './post.js';
import { diffCommand } from './diff.js';

export const validateCommand = new Command('validate')
  .description('部署配置验证工具')
  .addCommand(specCommand)
  .addCommand(preCommand)
  .addCommand(postCommand)
  .addCommand(diffCommand);
