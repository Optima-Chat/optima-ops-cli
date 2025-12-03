/**
 * observe health - 增强健康检查（支持 optima-core 端点）
 *
 * 检查服务的增强健康检查端点，返回：
 * - 服务状态
 * - 版本信息 (git_commit, version)
 * - 依赖检查 (database, redis)
 * - 响应时间
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

interface HealthCheckResult {
  status: string;
  service: string;
  version?: string;
  git_commit?: string;
  git_branch?: string;
  environment?: string;
  uptime_seconds?: number;
  timestamp?: string;
  checks?: Record<string, { status: string; latency_ms?: number }>;
}

interface ServiceHealthResult {
  service: string;
  type: string;
  url: string;
  status: 'healthy' | 'unhealthy' | 'error' | 'legacy';
  http_status?: number;
  response_time: string;
  version?: string;
  git_commit?: string;
  git_branch?: string;
  checks?: Record<string, { status: string; latency_ms?: number }>;
  error?: string;
}

export const healthCommand = new Command('health')
  .description('增强健康检查（支持 optima-core 端点）')
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
        printTitle(`🔍 增强健康检查 - ${env}`);
        console.log(chalk.gray(`域名: ${envConfig.domain}`));
        console.log(chalk.gray(`检查 optima-core 增强端点\n`));
      }

      const results: ServiceHealthResult[] = [];

      // 检查每个服务
      for (const serviceConfig of targetServices) {
        const envServiceConfig = serviceConfig.environments[env];
        if (!envServiceConfig) continue;

        const service = serviceConfig.name;
        const baseUrl = envServiceConfig.healthEndpoint.replace('/health', '');
        const healthUrl = `${baseUrl}/health`;

        if (!isJsonOutput()) {
          process.stdout.write(chalk.white(`检查 ${service.padEnd(20)}... `));
        }

        const startTime = Date.now();
        try {
          const response = await axios.get<HealthCheckResult>(healthUrl, {
            timeout: 10000,
            validateStatus: () => true,
          });

          const responseTime = Date.now() - startTime;
          const isHealthy = response.status === 200;
          const data = response.data;

          // 判断是否是增强的健康检查（有 checks 字段）
          const isEnhanced = data && typeof data === 'object' && 'checks' in data;

          const result: ServiceHealthResult = {
            service,
            type: serviceConfig.type,
            url: healthUrl,
            status: isHealthy ? 'healthy' : 'unhealthy',
            http_status: response.status,
            response_time: `${responseTime}ms`,
          };

          if (isEnhanced) {
            result.version = data.version;
            result.git_commit = data.git_commit;
            result.git_branch = data.git_branch;
            result.checks = data.checks;
          } else {
            result.status = isHealthy ? 'legacy' : 'unhealthy';
          }

          results.push(result);

          if (!isJsonOutput()) {
            if (isHealthy) {
              if (isEnhanced) {
                const commit = data.git_commit ? data.git_commit.substring(0, 7) : 'unknown';
                const checksStatus = data.checks
                  ? Object.entries(data.checks)
                      .map(([k, v]) => `${k}:${v.status === 'healthy' ? '✓' : '✗'}`)
                      .join(' ')
                  : '';
                console.log(
                  chalk.green(`✓ 健康`) +
                  chalk.gray(` (${responseTime}ms) `) +
                  chalk.cyan(`v${data.version || '?'} `) +
                  chalk.yellow(`@${commit} `) +
                  chalk.gray(checksStatus)
                );
              } else {
                console.log(
                  chalk.yellow(`✓ 旧版`) +
                  chalk.gray(` (${responseTime}ms) - 未集成 optima-core`)
                );
              }
            } else {
              console.log(chalk.red(`✗ 不健康 (HTTP ${response.status})`));
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
            url: healthUrl,
            status: 'error',
            response_time: `${responseTime}ms`,
            error: errorMsg,
          });

          if (!isJsonOutput()) {
            console.log(chalk.red(`✗ 错误: ${errorMsg}`));
          }
        }
      }

      // 输出结果
      if (isJsonOutput()) {
        outputSuccess({
          environment: env,
          domain: envConfig.domain,
          services: results,
          summary: {
            total: results.length,
            healthy: results.filter(r => r.status === 'healthy').length,
            legacy: results.filter(r => r.status === 'legacy').length,
            unhealthy: results.filter(r => r.status === 'unhealthy').length,
            error: results.filter(r => r.status === 'error').length,
          },
        });
      } else {
        // 打印总结
        const healthy = results.filter(r => r.status === 'healthy').length;
        const legacy = results.filter(r => r.status === 'legacy').length;
        const unhealthy = results.filter(r => r.status === 'unhealthy').length;
        const errors = results.filter(r => r.status === 'error').length;
        const total = results.length;

        console.log('\n' + chalk.gray('─'.repeat(60)));
        console.log(chalk.white('总结:'));
        console.log(chalk.green(`  ✓ 健康 (optima-core): ${healthy}`));
        if (legacy > 0) console.log(chalk.yellow(`  ⚠ 旧版 (未集成): ${legacy}`));
        if (unhealthy > 0) console.log(chalk.red(`  ✗ 不健康: ${unhealthy}`));
        if (errors > 0) console.log(chalk.red(`  ✗ 错误: ${errors}`));
        console.log();
      }
    } catch (error) {
      handleError(error);
    }
  });
