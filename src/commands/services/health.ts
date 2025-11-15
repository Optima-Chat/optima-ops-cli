import { Command } from 'commander';
import axios from 'axios';
import chalk from 'chalk';
import { getCurrentEnvironment, Environment, getAllServices, getServicesByType, getServiceConfig } from '../../utils/config.js';
import { SSHClient } from '../../utils/ssh.js';
import {
  isJsonOutput,
  outputSuccess,
  printTitle,
} from '../../utils/output.js';
import { handleError } from '../../utils/error.js';

export const healthCommand = new Command('health')
  .description('检查服务健康状态')
  .option('--env <env>', '环境 (production/stage/development)')
  .option('--service <service>', '特定服务名称')
  .option('--type <type>', '服务类型 (core/mcp/all)', 'all')
  .option('--json', 'JSON 格式输出')
  .action(async (options) => {
    try {
      let env: Environment = options.env || getCurrentEnvironment();

      // 获取服务列表
      let targetServices;
      if (options.service) {
        const serviceConfig = getServiceConfig(options.service);
        if (!serviceConfig) {
          throw new Error(`未知服务: ${options.service}`);
        }
        targetServices = [serviceConfig];
      } else {
        // 根据类型过滤
        if (options.type === 'core') {
          targetServices = getServicesByType('core');
        } else if (options.type === 'mcp') {
          targetServices = getServicesByType('mcp');
        } else {
          targetServices = getAllServices();
        }
      }

      if (!isJsonOutput()) {
        printTitle(`🏥 服务健康检查 - ${env} 环境`);
      }

      const results: any[] = [];

      // 检查每个服务
      for (const serviceConfig of targetServices) {
        const service = serviceConfig.name;
        const serviceUrl = serviceConfig.healthEndpoint;

        if (!isJsonOutput()) {
          process.stdout.write(chalk.white(`检查 ${service}... `));
        }

        const startTime = Date.now();
        try {
          // 有些端点已包含 /health，避免重复
          const healthUrl = serviceUrl.includes('/health') ? serviceUrl : `${serviceUrl}/health`;
          const response = await axios.get(healthUrl, {
            timeout: 10000,
            validateStatus: () => true, // 接受所有状态码
          });

          const responseTime = Date.now() - startTime;
          // MCP 服务的 404 也视为健康（服务运行但端点不同）
          const isHealthy = response.status === 200 || (serviceConfig.type === 'mcp' && response.status === 404);

          results.push({
            service,
            type: serviceConfig.type,
            url: serviceUrl,
            status: isHealthy ? 'healthy' : 'unhealthy',
            http_status: response.status,
            response_time: `${responseTime}ms`,
            response_data: response.data,
          });

          if (!isJsonOutput()) {
            if (isHealthy) {
              console.log(chalk.green(`✓ 健康 (${responseTime}ms)`));
            } else {
              console.log(chalk.red(`✗ 不健康 (状态码: ${response.status})`));
            }
          }
        } catch (error: any) {
          const responseTime = Date.now() - startTime;

          results.push({
            service,
            type: serviceConfig.type,
            url: serviceUrl,
            status: 'error',
            response_time: `${responseTime}ms`,
            error: error.message,
          });

          if (!isJsonOutput()) {
            console.log(chalk.red(`✗ 错误: ${error.message}`));
          }
        }
      }

      // 检查容器状态
      if (!isJsonOutput()) {
        console.log(chalk.white('\n检查容器状态...'));
      }

      try {
        const ssh = new SSHClient(env);
        await ssh.connect();

        const containerResult = await ssh.getContainerStatus();
        const containers = parseContainerStatus(containerResult.stdout);

        results.forEach(result => {
          const containerName = `optima-${result.service}-${env === 'production' ? 'prod' : env}`;
          const container = containers.find(c => c.name === containerName);

          if (container) {
            result.container_status = container.status;
          }
        });

        ssh.disconnect();
      } catch (error: any) {
        if (!isJsonOutput()) {
          console.log(chalk.yellow(`  ⚠ 无法获取容器状态: ${error.message}`));
        }
      }

      // 输出结果
      if (isJsonOutput()) {
        outputSuccess({
          environment: env,
          services: results,
          summary: {
            total: results.length,
            healthy: results.filter(r => r.status === 'healthy').length,
            unhealthy: results.filter(r => r.status === 'unhealthy').length,
            error: results.filter(r => r.status === 'error').length,
          },
        });
      } else {
        // 打印总结
        console.log(chalk.white('\n总结:'));
        const healthy = results.filter(r => r.status === 'healthy').length;
        const total = results.length;

        if (healthy === total) {
          console.log(chalk.green(`  ✓ 所有服务健康 (${healthy}/${total})`));
        } else {
          console.log(chalk.yellow(`  ⚠ ${healthy}/${total} 服务健康`));
        }
        console.log();
      }
    } catch (error) {
      handleError(error);
    }
  });

/**
 * 获取服务 URL
 */
function getServiceURL(service: string, env: Environment): string {
  const urlMap: Record<string, Record<Environment, string>> = {
    'user-auth': {
      production: 'https://auth.optima.shop',
      stage: 'https://auth-stage.optima.shop',
      development: 'https://auth.optima.chat',
    },
    'mcp-host': {
      production: 'https://mcp.optima.shop',
      stage: 'https://mcp-stage.optima.shop',
      development: 'https://mcp.optima.chat',
    },
    'commerce-backend': {
      production: 'https://api.optima.shop',
      stage: 'https://api-stage.optima.shop',
      development: 'https://api.optima.chat',
    },
    'agentic-chat': {
      production: 'https://ai.optima.shop',
      stage: 'https://ai-stage.optima.shop',
      development: 'https://ai.optima.chat',
    },
  };

  return urlMap[service]?.[env] || '';
}

/**
 * 解析容器状态输出
 */
function parseContainerStatus(output: string): Array<{ id: string; name: string; status: string; ports: string }> {
  return output
    .split('\n')
    .filter(line => line.trim())
    .map(line => {
      const [id, name, status, ports] = line.split('\t');
      return { id: id || '', name: name || '', status: status || '', ports: ports || '' };
    });
}
