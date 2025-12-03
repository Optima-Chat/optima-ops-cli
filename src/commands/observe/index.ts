/**
 * observe 模块 - 可观测性命令
 *
 * 提供 optima-core 集成服务的可观测性功能：
 * - health: 增强健康检查（含依赖状态、版本信息）
 * - info: 调试信息（构建信息、运行时信息）
 * - config: 配置检查（需要 DEBUG_KEY）
 */

import { Command } from 'commander';
import { healthCommand } from './health.js';
import { infoCommand } from './info.js';
import { configCommand } from './config.js';

export const observeCommand = new Command('observe')
  .description('可观测性命令 (optima-core 集成)')
  .addCommand(healthCommand)
  .addCommand(infoCommand)
  .addCommand(configCommand);
