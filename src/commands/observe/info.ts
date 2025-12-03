/**
 * observe info - 获取服务调试信息
 *
 * 调用 /debug/info 端点获取：
 * - 构建信息 (git_commit, git_branch, build_date, version)
 * - 运行时信息 (python_version, environment, debug_mode, log_level)
 * - 启动时间和运行时长
 */

import { Command } from 'commander';
import axios from 'axios';
import chalk from 'chalk';
import {
  resolveEnvironment,
  getServicesInEnvironment,
  getServiceForEnvironment,
  getServicesByTypeV2,
  getEnvironmentConfig,
} from '../../utils/config.js';
import {
  isJsonOutput,
  outputSuccess,
  printTitle,
} from '../../utils/output.js';
import { handleError } from '../../utils/error.js';

interface DebugInfo {
  build?: {
    git_commit?: string;
    git_branch?: string;
    build_date?: string;
    version?: string;
  };
  runtime?: {
    python_version?: string;
    node_version?: string;
    environment?: string;
    debug_mode?: boolean;
    log_level?: string;
  };
  startup_time?: string;
  uptime_seconds?: number;
}

interface ServiceInfoResult {
  service: string;
  type: string;
  url: string;
  status: 'ok' | 'error' | 'not_available';
  response_time: string;
  build?: DebugInfo['build'];
  runtime?: DebugInfo['runtime'];
  uptime_seconds?: number;
  error?: string;
}

export const infoCommand = new Command('info')
  .description('获取服务调试信息 (/debug/info)')
  .option('--env <env>', '环境 (ec2-prod/ecs-stage/ecs-prod)')
  .option('--service <service>', '特定服务名称')
  .option('--type <type>', '服务类型 (core/mcp/all)', 'core')
  .option('--json', 'JSON 格式输出')
  .action(async (options) => {
    try {
      const env = resolveEnvironment(options.env);
      const envConfig = getEnvironmentConfig(env);

      // 获取该环境下的服务列表
      let targetServices = getServicesInEnvironment(env);

      // 按服务名过滤
      if (options.service) {
        const result = getServiceForEnvironment(options.service, env);
        if (!result) {
          throw new Error(`服务 ${options.service} 在环境 ${env} 中不存在`);
        }
        targetServices = [result.service];
      }
      // 按类型过滤
      else if (options.type && options.type !== 'all') {
        const typeServices = getServicesByTypeV2(options.type);
        targetServices = targetServices.filter(s =>
          typeServices.some(ts => ts.name === s.name)
        );
      }

      if (!isJsonOutput()) {
        printTitle(`📋 服务调试信息 - ${env}`);
        console.log(chalk.gray(`域名: ${envConfig.domain}`));
        console.log(chalk.gray(`调用 /debug/info 端点\n`));
      }

      const results: ServiceInfoResult[] = [];

      // 检查每个服务
      for (const serviceConfig of targetServices) {
        const envServiceConfig = serviceConfig.environments[env];
        if (!envServiceConfig) continue;

        const service = serviceConfig.name;
        const baseUrl = envServiceConfig.healthEndpoint.replace('/health', '');
        const infoUrl = `${baseUrl}/debug/info`;

        if (!isJsonOutput()) {
          console.log(chalk.cyan(`\n${service}`));
          console.log(chalk.gray('─'.repeat(40)));
        }

        const startTime = Date.now();
        try {
          const response = await axios.get<DebugInfo>(infoUrl, {
            timeout: 10000,
            validateStatus: () => true,
          });

          const responseTime = Date.now() - startTime;

          if (response.status === 200) {
            const data = response.data;

            const result: ServiceInfoResult = {
              service,
              type: serviceConfig.type,
              url: infoUrl,
              status: 'ok',
              response_time: `${responseTime}ms`,
              build: data.build,
              runtime: data.runtime,
              uptime_seconds: data.uptime_seconds,
            };

            results.push(result);

            if (!isJsonOutput()) {
              // 构建信息
              if (data.build) {
                console.log(chalk.white('  构建信息:'));
                if (data.build.version) {
                  console.log(chalk.gray(`    版本: `) + chalk.green(data.build.version));
                }
                if (data.build.git_commit) {
                  console.log(chalk.gray(`    Commit: `) + chalk.yellow(data.build.git_commit.substring(0, 7)));
                }
                if (data.build.git_branch) {
                  console.log(chalk.gray(`    分支: `) + chalk.cyan(data.build.git_branch));
                }
                if (data.build.build_date) {
                  console.log(chalk.gray(`    构建时间: `) + chalk.white(toBeijingTime(data.build.build_date)));
                }
              }

              // 运行时信息
              if (data.runtime) {
                console.log(chalk.white('  运行时:'));
                if (data.runtime.python_version) {
                  console.log(chalk.gray(`    Python: `) + chalk.white(data.runtime.python_version));
                }
                if (data.runtime.node_version) {
                  console.log(chalk.gray(`    Node.js: `) + chalk.white(data.runtime.node_version));
                }
                if (data.runtime.environment) {
                  console.log(chalk.gray(`    环境: `) + chalk.white(data.runtime.environment));
                }
                if (data.runtime.log_level) {
                  console.log(chalk.gray(`    日志级别: `) + chalk.white(data.runtime.log_level));
                }
                if (data.runtime.debug_mode !== undefined) {
                  const debugStatus = data.runtime.debug_mode ? chalk.yellow('开启') : chalk.green('关闭');
                  console.log(chalk.gray(`    调试模式: `) + debugStatus);
                }
              }

              // 运行时长
              if (data.uptime_seconds !== undefined) {
                const uptime = formatUptime(data.uptime_seconds);
                console.log(chalk.white('  运行时长: ') + chalk.green(uptime));
              }

              console.log(chalk.gray(`  响应时间: ${responseTime}ms`));
            }
          } else if (response.status === 404) {
            results.push({
              service,
              type: serviceConfig.type,
              url: infoUrl,
              status: 'not_available',
              response_time: `${responseTime}ms`,
              error: '端点不存在 (未集成 optima-core)',
            });

            if (!isJsonOutput()) {
              console.log(chalk.yellow('  ⚠ 端点不存在 - 未集成 optima-core'));
            }
          } else {
            results.push({
              service,
              type: serviceConfig.type,
              url: infoUrl,
              status: 'error',
              response_time: `${responseTime}ms`,
              error: `HTTP ${response.status}`,
            });

            if (!isJsonOutput()) {
              console.log(chalk.red(`  ✗ HTTP ${response.status}`));
            }
          }
        } catch (error: any) {
          const responseTime = Date.now() - startTime;
          const errorMsg = error.code === 'ECONNREFUSED' ? '连接被拒绝' :
                          error.code === 'ETIMEDOUT' ? '连接超时' :
                          error.message;

          results.push({
            service,
            type: serviceConfig.type,
            url: infoUrl,
            status: 'error',
            response_time: `${responseTime}ms`,
            error: errorMsg,
          });

          if (!isJsonOutput()) {
            console.log(chalk.red(`  ✗ 错误: ${errorMsg}`));
          }
        }
      }

      // 输出 JSON 结果
      if (isJsonOutput()) {
        outputSuccess({
          environment: env,
          domain: envConfig.domain,
          services: results,
          summary: {
            total: results.length,
            ok: results.filter(r => r.status === 'ok').length,
            not_available: results.filter(r => r.status === 'not_available').length,
            error: results.filter(r => r.status === 'error').length,
          },
        });
      } else {
        // 打印总结
        const ok = results.filter(r => r.status === 'ok').length;
        const notAvailable = results.filter(r => r.status === 'not_available').length;
        const errors = results.filter(r => r.status === 'error').length;

        console.log('\n' + chalk.gray('─'.repeat(60)));
        console.log(chalk.white('总结:'));
        console.log(chalk.green(`  ✓ 可用: ${ok}`));
        if (notAvailable > 0) console.log(chalk.yellow(`  ⚠ 未集成: ${notAvailable}`));
        if (errors > 0) console.log(chalk.red(`  ✗ 错误: ${errors}`));
        console.log();
      }
    } catch (error) {
      handleError(error);
    }
  });

/**
 * 格式化运行时长
 */
function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}天`);
  if (hours > 0) parts.push(`${hours}小时`);
  if (minutes > 0) parts.push(`${minutes}分钟`);
  if (parts.length === 0) parts.push(`${secs}秒`);

  return parts.join(' ');
}

/**
 * 将 UTC 时间转换为北京时间 (UTC+8) 并格式化
 */
function toBeijingTime(utcTimeStr: string): string {
  try {
    const date = new Date(utcTimeStr);
    if (isNaN(date.getTime())) {
      return utcTimeStr; // 无法解析，返回原始值
    }
    // 使用 toLocaleString 转换为北京时间
    return date.toLocaleString('zh-CN', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }) + ' (北京时间)';
  } catch {
    return utcTimeStr;
  }
}
