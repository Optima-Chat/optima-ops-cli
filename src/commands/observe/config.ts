/**
 * observe config - 获取服务配置信息（需要 DEBUG_KEY）
 *
 * 调用 /debug/config 端点获取：
 * - 环境变量配置（脱敏）
 * - Infisical 状态
 * - 配置来源
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

// DEBUG_KEY - 从 Infisical 共享配置
const DEBUG_KEY = '7eede5747b6c50f1c8f2358b98462f74696cdef9bfeab85eaf7ea41166788b5c';

interface DebugConfig {
  config?: Record<string, string>;
  infisical_enabled?: boolean;
  config_source?: string;
}

interface ServiceConfigResult {
  service: string;
  type: string;
  url: string;
  status: 'ok' | 'unauthorized' | 'not_available' | 'error';
  response_time: string;
  config?: Record<string, string>;
  infisical_enabled?: boolean;
  config_source?: string;
  error?: string;
}

export const configCommand = new Command('config')
  .description('获取服务配置信息 (/debug/config)')
  .option('--env <env>', '环境 (ec2-prod/ecs-stage/ecs-prod)')
  .option('--service <service>', '特定服务名称 (必填)')
  .option('--key <key>', '自定义 DEBUG_KEY')
  .option('--filter <pattern>', '过滤配置项 (正则)')
  .option('--json', 'JSON 格式输出')
  .action(async (options) => {
    try {
      const env = resolveEnvironment(options.env);
      const envConfig = getEnvironmentConfig(env);

      // 必须指定服务
      if (!options.service) {
        throw new Error('必须指定服务名称 (--service <name>)');
      }

      const result = getServiceForEnvironment(options.service, env);
      if (!result) {
        throw new Error(`服务 ${options.service} 在环境 ${env} 中不存在`);
      }

      const serviceConfig = result.service;
      const envServiceConfig = serviceConfig.environments[env];
      const service = serviceConfig.name;
      const baseUrl = envServiceConfig.healthEndpoint.replace('/health', '');
      const configUrl = `${baseUrl}/debug/config`;

      const debugKey = options.key || DEBUG_KEY;

      if (!isJsonOutput()) {
        printTitle(`🔧 服务配置 - ${service} (${env})`);
        console.log(chalk.gray(`URL: ${configUrl}`));
        console.log(chalk.gray(`使用 DEBUG_KEY: ${debugKey.substring(0, 8)}...`));
        console.log();
      }

      const startTime = Date.now();
      try {
        const response = await axios.get<DebugConfig>(configUrl, {
          timeout: 10000,
          headers: {
            'X-Debug-Key': debugKey,
          },
          validateStatus: () => true,
        });

        const responseTime = Date.now() - startTime;

        if (response.status === 200) {
          const data = response.data;

          if (isJsonOutput()) {
            outputSuccess({
              environment: env,
              service,
              url: configUrl,
              status: 'ok',
              response_time: `${responseTime}ms`,
              config: data.config,
              infisical_enabled: data.infisical_enabled,
              config_source: data.config_source,
            });
          } else {
            // 配置来源
            if (data.config_source) {
              console.log(chalk.white('配置来源: ') + chalk.cyan(data.config_source));
            }
            if (data.infisical_enabled !== undefined) {
              const status = data.infisical_enabled ? chalk.green('已启用') : chalk.yellow('未启用');
              console.log(chalk.white('Infisical: ') + status);
            }

            // 配置项
            if (data.config) {
              console.log(chalk.white('\n配置项:'));
              console.log(chalk.gray('─'.repeat(60)));

              let configs = Object.entries(data.config);

              // 按名称排序
              configs.sort((a, b) => a[0].localeCompare(b[0]));

              // 过滤
              if (options.filter) {
                const regex = new RegExp(options.filter, 'i');
                configs = configs.filter(([key]) => regex.test(key));
              }

              for (const [key, value] of configs) {
                // 高亮敏感配置
                const isSensitive = /key|secret|password|token/i.test(key);
                const keyColor = isSensitive ? chalk.yellow : chalk.white;
                const valueColor = isSensitive ? chalk.gray : chalk.green;

                console.log(`  ${keyColor(key.padEnd(35))} ${valueColor(value)}`);
              }

              console.log(chalk.gray('\n─'.repeat(60)));
              console.log(chalk.gray(`共 ${configs.length} 项配置`));
            }

            console.log(chalk.gray(`\n响应时间: ${responseTime}ms`));
          }
        } else if (response.status === 401 || response.status === 403) {
          if (isJsonOutput()) {
            outputSuccess({
              environment: env,
              service,
              url: configUrl,
              status: 'unauthorized',
              response_time: `${responseTime}ms`,
              error: 'DEBUG_KEY 无效或未提供',
            });
          } else {
            console.log(chalk.red('✗ 认证失败: DEBUG_KEY 无效或未提供'));
            console.log(chalk.gray('\n提示: 使用 --key <DEBUG_KEY> 指定正确的密钥'));
          }
        } else if (response.status === 404) {
          if (isJsonOutput()) {
            outputSuccess({
              environment: env,
              service,
              url: configUrl,
              status: 'not_available',
              response_time: `${responseTime}ms`,
              error: '端点不存在 (未集成 optima-core)',
            });
          } else {
            console.log(chalk.yellow('⚠ 端点不存在 - 服务未集成 optima-core'));
          }
        } else {
          if (isJsonOutput()) {
            outputSuccess({
              environment: env,
              service,
              url: configUrl,
              status: 'error',
              response_time: `${responseTime}ms`,
              error: `HTTP ${response.status}`,
            });
          } else {
            console.log(chalk.red(`✗ HTTP ${response.status}`));
          }
        }
      } catch (error: any) {
        const responseTime = Date.now() - startTime;
        const errorMsg = error.code === 'ECONNREFUSED' ? '连接被拒绝' :
                        error.code === 'ETIMEDOUT' ? '连接超时' :
                        error.message;

        if (isJsonOutput()) {
          outputSuccess({
            environment: env,
            service,
            url: configUrl,
            status: 'error',
            response_time: `${responseTime}ms`,
            error: errorMsg,
          });
        } else {
          console.log(chalk.red(`✗ 错误: ${errorMsg}`));
        }
      }
    } catch (error) {
      handleError(error);
    }
  });
