import { Command } from 'commander';
import { ec2Command } from './ec2.js';
import { dockerCommand } from './docker.js';
import { diskCommand } from './disk.js';
import { networkCommand } from './network.js';
import { runnerCommand } from './runner.js';

export const infraCommand = new Command('infra')
  .description('基础设施监控和资源管理')
  .addCommand(ec2Command)
  .addCommand(dockerCommand)
  .addCommand(diskCommand)
  .addCommand(networkCommand)
  .addCommand(runnerCommand);
