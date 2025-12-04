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
import { SSHClient } from '../../utils/ssh.js';
import {
  isJsonOutput,
  outputSuccess,
  printTitle,
} from '../../utils/output.js';
import { handleError } from '../../utils/error.js';

export const healthCommand = new Command('health')
  .description('检查服务健康状态')
  .option('--env <env>', '环境 (ec2-prod/ecs-stage/ecs-prod/bi-data)')
  .option('--service <service>', '特定服务名称')
  .option('--type <type>', '服务类型 (core/mcp/bi/all)', 'all')
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
        printTitle(`🏥 服务健康检查 - ${env} (${envConfig.description})`);
        console.log(chalk.gray(`域名: ${envConfig.domain}\n`));
      }

      const results: any[] = [];

      // 检查每个服务
      for (const serviceConfig of targetServices) {
        const envServiceConfig = serviceConfig.environments[env];
        if (!envServiceConfig) continue;

        const service = serviceConfig.name;
        const healthUrl = envServiceConfig.healthEndpoint;

        if (!isJsonOutput()) {
          process.stdout.write(chalk.white(`检查 ${service.padEnd(20)}... `));
        }

        const startTime = Date.now();
        try {
          const response = await axios.get(healthUrl, {
            timeout: 10000,
            validateStatus: () => true,
          });

          const responseTime = Date.now() - startTime;
          const isHealthy = response.status === 200 || response.status === 204;

          results.push({
            service,
            type: serviceConfig.type,
            url: healthUrl,
            status: isHealthy ? 'healthy' : 'unhealthy',
            http_status: response.status,
            response_time: `${responseTime}ms`,
          });

          if (!isJsonOutput()) {
            if (isHealthy) {
              console.log(chalk.green(`✓ 健康`) + chalk.gray(` (${responseTime}ms)`));
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

      // EC2 环境：检查容器状态
      if (envConfig.type === 'ec2' && envConfig.host) {
        if (!isJsonOutput()) {
          console.log(chalk.white('\n检查容器状态...'));
        }

        try {
          // 映射新环境名到旧 SSH 环境名
          const sshEnvMap: Record<string, string> = {
            'ec2-prod': 'production',
            'bi-data': 'bi-data',
          };
          const sshEnv = sshEnvMap[env] || env;
          const ssh = new SSHClient(sshEnv as any);
          await ssh.connect();

          const containerResult = await ssh.getContainerStatus();
          const containers = parseContainerStatus(containerResult.stdout);

          results.forEach(result => {
            const containerName = `optima-${result.service}-prod`;
            const container = containers.find(c => c.name === containerName);
            if (container) {
              result.container_status = container.status;
            }
          });

          ssh.disconnect();
          if (!isJsonOutput()) {
            console.log(chalk.green('  ✓ 容器状态已获取'));
          }
        } catch (error: any) {
          if (!isJsonOutput()) {
            console.log(chalk.yellow(`  ⚠ 无法获取容器状态: ${error.message}`));
          }
        }
      }

      // 输出结果
      if (isJsonOutput()) {
        outputSuccess({
          environment: env,
          environmentType: envConfig.type,
          domain: envConfig.domain,
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
        const healthy = results.filter(r => r.status === 'healthy').length;
        const unhealthy = results.filter(r => r.status === 'unhealthy').length;
        const errors = results.filter(r => r.status === 'error').length;
        const total = results.length;

        console.log('\n' + chalk.gray('─'.repeat(50)));
        console.log(chalk.white('总结:'));

        if (healthy === total) {
          console.log(chalk.green(`  ✓ 所有服务健康 (${healthy}/${total})`));
        } else {
          console.log(chalk.green(`  ✓ 健康: ${healthy}`));
          if (unhealthy > 0) console.log(chalk.red(`  ✗ 不健康: ${unhealthy}`));
          if (errors > 0) console.log(chalk.red(`  ✗ 错误: ${errors}`));
        }
        console.log();
      }
    } catch (error) {
      handleError(error);
    }
  });

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
