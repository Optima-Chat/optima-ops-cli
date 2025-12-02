import { Command } from 'commander';
import axios from 'axios';
import chalk from 'chalk';
import {
  resolveEnvironment,
  getEnvironments,
} from '../../utils/config.js';
import { handleError } from '../../utils/error.js';
import { isJsonOutput, outputSuccess } from '../../utils/output.js';

// OAuth API 基础配置
function getAuthBaseUrl(env: string): string {
  const envs = getEnvironments();
  const envConfig = envs[env as keyof typeof envs];

  if (!envConfig) {
    throw new Error(`未知环境: ${env}`);
  }

  // 根据环境构建 auth URL
  if (env === 'ec2-prod') {
    return 'https://auth.optima.shop';
  } else if (env === 'ecs-stage') {
    return 'https://auth.stage.optima.onl';
  } else if (env === 'ecs-prod') {
    return 'https://auth.optima.onl';
  }

  throw new Error(`环境 ${env} 不支持 OAuth 管理`);
}

// ============== oauth clients list ==============

const listCommand = new Command('list')
  .description('列出所有 OAuth 客户端')
  .option('--env <env>', '环境 (ec2-prod|ecs-stage|ecs-prod)')
  .option('--json', 'JSON 输出')
  .action(async (options) => {
    try {
      const env = resolveEnvironment(options.env);
      const baseUrl = getAuthBaseUrl(env);

      const response = await axios.get(`${baseUrl}/api/v1/oauth/clients`, {
        timeout: 10000,
      });

      const clients = response.data.clients || response.data || [];

      if (isJsonOutput()) {
        outputSuccess({ clients, environment: env });
      } else {
        console.log(chalk.bold(`\nOAuth 客户端列表 - ${env}`));
        console.log(chalk.gray('─'.repeat(80)));

        if (clients.length === 0) {
          console.log(chalk.yellow('没有 OAuth 客户端'));
        } else {
          console.log(
            chalk.gray(
              'Client ID'.padEnd(25) +
                '名称'.padEnd(20) +
                '类型'.padEnd(15) +
                '重定向 URI'
            )
          );
          console.log(chalk.gray('─'.repeat(80)));

          for (const client of clients) {
            const type = client.client_type || client.type || 'public';
            const redirectUris = client.redirect_uris || [];
            const firstUri = redirectUris[0] || '-';

            console.log(
              `${chalk.cyan(client.client_id?.padEnd(25) || '-')} ` +
                `${(client.client_name || '-').padEnd(20)} ` +
                `${type.padEnd(15)} ` +
                `${chalk.gray(firstUri)}`
            );
          }
        }

        console.log(chalk.gray('─'.repeat(80)));
        console.log(`共 ${clients.length} 个客户端\n`);
      }
    } catch (error: any) {
      if (error.response?.status === 401 || error.response?.status === 403) {
        console.log(chalk.yellow('需要管理员认证才能访问 OAuth 客户端列表'));
        console.log(chalk.gray('请使用 --token 参数提供访问令牌'));
      } else {
        handleError(error);
      }
    }
  });

// ============== oauth clients get ==============

const getCommand = new Command('get')
  .description('获取 OAuth 客户端详情')
  .argument('<client-id>', '客户端 ID')
  .option('--env <env>', '环境 (ec2-prod|ecs-stage|ecs-prod)')
  .option('--json', 'JSON 输出')
  .action(async (clientId, options) => {
    try {
      const env = resolveEnvironment(options.env);
      const baseUrl = getAuthBaseUrl(env);

      const response = await axios.get(
        `${baseUrl}/api/v1/oauth/clients/${clientId}`,
        { timeout: 10000 }
      );

      const client = response.data;

      if (isJsonOutput()) {
        outputSuccess({ client, environment: env });
      } else {
        console.log(chalk.bold(`\nOAuth 客户端详情: ${clientId}`));
        console.log(chalk.gray('─'.repeat(60)));

        console.log(`Client ID: ${chalk.cyan(client.client_id)}`);
        console.log(`名称: ${client.client_name || '-'}`);
        console.log(`类型: ${client.client_type || 'public'}`);
        console.log(`范围: ${client.scope || '-'}`);

        if (client.redirect_uris?.length > 0) {
          console.log(chalk.gray('\n重定向 URI:'));
          for (const uri of client.redirect_uris) {
            console.log(`  - ${uri}`);
          }
        }

        if (client.grant_types?.length > 0) {
          console.log(chalk.gray('\n授权类型:'));
          for (const grant of client.grant_types) {
            console.log(`  - ${grant}`);
          }
        }

        console.log();
      }
    } catch (error: any) {
      if (error.response?.status === 404) {
        console.log(chalk.red(`客户端不存在: ${clientId}`));
      } else {
        handleError(error);
      }
    }
  });

// ============== oauth well-known ==============

const wellKnownCommand = new Command('well-known')
  .description('查看 OAuth 服务器配置 (.well-known/openid-configuration)')
  .option('--env <env>', '环境 (ec2-prod|ecs-stage|ecs-prod)')
  .option('--json', 'JSON 输出')
  .action(async (options) => {
    try {
      const env = resolveEnvironment(options.env);
      const baseUrl = getAuthBaseUrl(env);

      const response = await axios.get(
        `${baseUrl}/.well-known/openid-configuration`,
        { timeout: 10000 }
      );

      const config = response.data;

      if (isJsonOutput()) {
        outputSuccess({ config, environment: env });
      } else {
        console.log(chalk.bold(`\nOAuth 服务器配置 - ${env}`));
        console.log(chalk.gray('─'.repeat(60)));

        console.log(`Issuer: ${chalk.cyan(config.issuer)}`);
        console.log(`Authorization: ${config.authorization_endpoint}`);
        console.log(`Token: ${config.token_endpoint}`);
        console.log(`UserInfo: ${config.userinfo_endpoint}`);
        console.log(`JWKS URI: ${config.jwks_uri}`);

        if (config.grant_types_supported?.length > 0) {
          console.log(chalk.gray('\n支持的授权类型:'));
          for (const grant of config.grant_types_supported) {
            console.log(`  - ${grant}`);
          }
        }

        if (config.scopes_supported?.length > 0) {
          console.log(chalk.gray('\n支持的范围:'));
          for (const scope of config.scopes_supported) {
            console.log(`  - ${scope}`);
          }
        }

        console.log();
      }
    } catch (error) {
      handleError(error);
    }
  });

// ============== oauth health ==============

const healthCommand = new Command('health')
  .description('检查 OAuth 服务健康状态')
  .option('--env <env>', '环境 (ec2-prod|ecs-stage|ecs-prod)')
  .option('--json', 'JSON 输出')
  .action(async (options) => {
    try {
      const env = resolveEnvironment(options.env);
      const baseUrl = getAuthBaseUrl(env);

      const startTime = Date.now();
      const response = await axios.get(`${baseUrl}/health`, {
        timeout: 10000,
      });
      const latency = Date.now() - startTime;

      const health = response.data;

      if (isJsonOutput()) {
        outputSuccess({
          healthy: true,
          latency,
          environment: env,
          ...health,
        });
      } else {
        const status =
          health.status === 'healthy' || response.status === 200
            ? chalk.green('✓ 健康')
            : chalk.yellow('⚠ 异常');

        console.log(chalk.bold(`\nOAuth 服务健康状态 - ${env}`));
        console.log(chalk.gray('─'.repeat(40)));
        console.log(`状态: ${status}`);
        console.log(`延迟: ${latency}ms`);
        console.log(`URL: ${baseUrl}`);

        if (health.version) {
          console.log(`版本: ${health.version}`);
        }

        console.log();
      }
    } catch (error: any) {
      if (isJsonOutput()) {
        outputSuccess({
          healthy: false,
          error: error.message,
        });
      } else {
        console.log(chalk.red('✗ OAuth 服务不可用'));
        console.log(chalk.gray(`错误: ${error.message}`));
      }
    }
  });

// ============== 导出 ==============

export const oauthCommand = new Command('oauth')
  .description('OAuth 客户端管理')
  .addCommand(listCommand)
  .addCommand(getCommand)
  .addCommand(wellKnownCommand)
  .addCommand(healthCommand);
