import { Command } from 'commander';
import {
  ECSClient,
  ListServicesCommand,
  DescribeServicesCommand,
  UpdateServiceCommand,
} from '@aws-sdk/client-ecs';
import {
  CloudWatchLogsClient,
  FilterLogEventsCommand,
} from '@aws-sdk/client-cloudwatch-logs';
import chalk from 'chalk';
import {
  resolveEnvironment,
  getEnvironmentConfig,
  getECSCluster,
  getAWSRegion,
} from '../../utils/config.js';
import { handleError } from '../../utils/error.js';
import { isJsonOutput, outputSuccess } from '../../utils/output.js';

const ecsClient = new ECSClient({ region: getAWSRegion() });
const logsClient = new CloudWatchLogsClient({ region: getAWSRegion() });

// ============== services list ==============

const listCommand = new Command('list')
  .description('列出 ECS 服务')
  .option('--env <env>', '环境 (ecs-stage|ecs-prod)')
  .option('--json', 'JSON 输出')
  .action(async (options) => {
    try {
      const env = resolveEnvironment(options.env);
      const envConfig = getEnvironmentConfig(env);

      if (envConfig.type !== 'ecs') {
        throw new Error(`环境 ${env} 不是 ECS 类型`);
      }

      const cluster = getECSCluster(env);

      // 获取 ECS 服务列表
      const listResult = await ecsClient.send(
        new ListServicesCommand({ cluster })
      );

      const serviceArns = listResult.serviceArns || [];

      if (serviceArns.length === 0) {
        if (isJsonOutput()) {
          outputSuccess({ services: [], cluster, environment: env });
        } else {
          console.log(chalk.yellow(`集群 ${cluster} 中没有服务`));
        }
        return;
      }

      // 获取服务详情
      const describeResult = await ecsClient.send(
        new DescribeServicesCommand({
          cluster,
          services: serviceArns,
        })
      );

      const services = (describeResult.services || []).map((s) => ({
        name: s.serviceName,
        status: s.status,
        desiredCount: s.desiredCount,
        runningCount: s.runningCount,
        pendingCount: s.pendingCount,
        taskDefinition: s.taskDefinition?.split('/').pop(),
        createdAt: s.createdAt,
      }));

      if (isJsonOutput()) {
        outputSuccess({ services, cluster, environment: env });
      } else {
        console.log(chalk.bold(`\nECS 服务列表 - ${env}`));
        console.log(chalk.gray(`集群: ${cluster}`));
        console.log(chalk.gray('─'.repeat(80)));

        for (const svc of services) {
          const statusIcon =
            svc.runningCount === svc.desiredCount && svc.status === 'ACTIVE'
              ? chalk.green('✓')
              : chalk.yellow('⚠');

          console.log(
            `${statusIcon} ${chalk.cyan(svc.name?.padEnd(30))} ` +
              `${chalk.white(`${svc.runningCount}/${svc.desiredCount}`)} ` +
              `${chalk.gray(svc.status || '')}`
          );
        }

        console.log(chalk.gray('─'.repeat(80)));
        console.log(`共 ${services.length} 个服务\n`);
      }
    } catch (error) {
      handleError(error);
    }
  });

// ============== services status ==============

const statusCommand = new Command('status')
  .description('查看 ECS 服务状态')
  .argument('<service>', '服务名称')
  .option('--env <env>', '环境 (ecs-stage|ecs-prod)')
  .option('--json', 'JSON 输出')
  .action(async (serviceName, options) => {
    try {
      const env = resolveEnvironment(options.env);
      const cluster = getECSCluster(env);

      // 构造完整服务名
      const fullServiceName = serviceName.startsWith('optima-')
        ? serviceName
        : `optima-${env.split('-')[1]}-${serviceName}`;

      const result = await ecsClient.send(
        new DescribeServicesCommand({
          cluster,
          services: [fullServiceName],
        })
      );

      const service = result.services?.[0];

      if (!service) {
        throw new Error(`服务未找到: ${fullServiceName}`);
      }

      const status = {
        name: service.serviceName,
        status: service.status,
        desiredCount: service.desiredCount,
        runningCount: service.runningCount,
        pendingCount: service.pendingCount,
        taskDefinition: service.taskDefinition,
        deployments: service.deployments?.map((d) => ({
          status: d.status,
          desiredCount: d.desiredCount,
          runningCount: d.runningCount,
          pendingCount: d.pendingCount,
          createdAt: d.createdAt,
          updatedAt: d.updatedAt,
        })),
        events: service.events?.slice(0, 5).map((e) => ({
          createdAt: e.createdAt,
          message: e.message,
        })),
      };

      if (isJsonOutput()) {
        outputSuccess({ service: status, cluster, environment: env });
      } else {
        console.log(chalk.bold(`\n服务状态: ${service.serviceName}`));
        console.log(chalk.gray(`集群: ${cluster}`));
        console.log(chalk.gray('─'.repeat(60)));

        const statusColor =
          service.runningCount === service.desiredCount
            ? chalk.green
            : chalk.yellow;

        console.log(`状态: ${statusColor(service.status || 'UNKNOWN')}`);
        console.log(
          `任务: ${statusColor(
            `${service.runningCount}/${service.desiredCount}`
          )} 运行中`
        );
        if (service.pendingCount && service.pendingCount > 0) {
          console.log(`等待中: ${chalk.yellow(service.pendingCount)}`);
        }

        console.log(chalk.gray('\n最近事件:'));
        for (const event of service.events?.slice(0, 5) || []) {
          const time = event.createdAt
            ? new Date(event.createdAt).toLocaleString()
            : '';
          console.log(`  ${chalk.gray(time)} ${event.message}`);
        }

        console.log();
      }
    } catch (error) {
      handleError(error);
    }
  });

// ============== services logs ==============

const logsCommand = new Command('logs')
  .description('查看 ECS 服务日志')
  .argument('<service>', '服务名称')
  .option('--env <env>', '环境 (ecs-stage|ecs-prod)')
  .option('--tail <lines>', '显示最后 N 行', '100')
  .option('--json', 'JSON 输出')
  .action(async (serviceName, options) => {
    try {
      const env = resolveEnvironment(options.env);
      const envPrefix = env === 'ecs-stage' ? 'stage' : 'prod';

      // 日志组名称格式: /ecs/service-name-stage 或 /ecs/service-name-prod
      const logGroupName = `/ecs/${serviceName}-${envPrefix}`;

      const startTime = Date.now() - 3600000; // 最近 1 小时

      const result = await logsClient.send(
        new FilterLogEventsCommand({
          logGroupName,
          startTime,
          limit: parseInt(options.tail),
        })
      );

      const events = result.events || [];

      if (isJsonOutput()) {
        outputSuccess({
          logGroup: logGroupName,
          events: events.map((e) => ({
            timestamp: e.timestamp,
            message: e.message,
          })),
        });
      } else {
        console.log(chalk.bold(`\n日志: ${logGroupName}`));
        console.log(chalk.gray('─'.repeat(60)));

        if (events.length === 0) {
          console.log(chalk.yellow('没有日志记录'));
        } else {
          for (const event of events) {
            const time = event.timestamp
              ? new Date(event.timestamp).toLocaleTimeString()
              : '';
            console.log(`${chalk.gray(time)} ${event.message}`);
          }
        }

        console.log();
      }
    } catch (error: any) {
      if (error.name === 'ResourceNotFoundException') {
        console.log(chalk.yellow(`日志组不存在，服务可能未配置日志`));
      } else {
        handleError(error);
      }
    }
  });

// ============== services restart ==============

const restartCommand = new Command('restart')
  .description('重启 ECS 服务（强制新部署）')
  .argument('<service>', '服务名称')
  .option('--env <env>', '环境 (ecs-stage|ecs-prod)')
  .option('--yes', '跳过确认')
  .action(async (serviceName, options) => {
    try {
      const env = resolveEnvironment(options.env);
      const cluster = getECSCluster(env);

      // 构造完整服务名
      const fullServiceName = serviceName.startsWith('optima-')
        ? serviceName
        : `optima-${env.split('-')[1]}-${serviceName}`;

      if (!options.yes) {
        const readline = await import('readline');
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
        });

        const answer = await new Promise<string>((resolve) => {
          rl.question(
            chalk.yellow(
              `确定要重启服务 ${fullServiceName} 吗? (y/N) `
            ),
            resolve
          );
        });
        rl.close();

        if (answer.toLowerCase() !== 'y') {
          console.log('已取消');
          return;
        }
      }

      console.log(chalk.cyan(`正在重启服务 ${fullServiceName}...`));

      await ecsClient.send(
        new UpdateServiceCommand({
          cluster,
          service: fullServiceName,
          forceNewDeployment: true,
        })
      );

      console.log(chalk.green(`✓ 已触发重启，新部署正在进行中`));
      console.log(chalk.gray(`使用 'optima-ops ecs services status ${serviceName} --env ${env}' 查看状态`));
    } catch (error) {
      handleError(error);
    }
  });

// ============== services scale ==============

const scaleCommand = new Command('scale')
  .description('扩缩容 ECS 服务')
  .argument('<service>', '服务名称')
  .requiredOption('--count <n>', '目标任务数')
  .option('--env <env>', '环境 (ecs-stage|ecs-prod)')
  .option('--yes', '跳过确认')
  .action(async (serviceName, options) => {
    try {
      const env = resolveEnvironment(options.env);
      const cluster = getECSCluster(env);
      const count = parseInt(options.count);

      if (isNaN(count) || count < 0) {
        throw new Error('--count 必须是非负整数');
      }

      // 构造完整服务名
      const fullServiceName = serviceName.startsWith('optima-')
        ? serviceName
        : `optima-${env.split('-')[1]}-${serviceName}`;

      if (!options.yes) {
        const readline = await import('readline');
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
        });

        const answer = await new Promise<string>((resolve) => {
          rl.question(
            chalk.yellow(
              `确定要将服务 ${fullServiceName} 扩缩容到 ${count} 个任务吗? (y/N) `
            ),
            resolve
          );
        });
        rl.close();

        if (answer.toLowerCase() !== 'y') {
          console.log('已取消');
          return;
        }
      }

      console.log(chalk.cyan(`正在扩缩容服务 ${fullServiceName} 到 ${count} 个任务...`));

      await ecsClient.send(
        new UpdateServiceCommand({
          cluster,
          service: fullServiceName,
          desiredCount: count,
        })
      );

      console.log(chalk.green(`✓ 已设置目标任务数为 ${count}`));
      console.log(chalk.gray(`使用 'optima-ops ecs services status ${serviceName} --env ${env}' 查看状态`));
    } catch (error) {
      handleError(error);
    }
  });

// ============== 导出 ==============

export const servicesCommand = new Command('services')
  .description('ECS 服务管理')
  .addCommand(listCommand)
  .addCommand(statusCommand)
  .addCommand(logsCommand)
  .addCommand(restartCommand)
  .addCommand(scaleCommand);
