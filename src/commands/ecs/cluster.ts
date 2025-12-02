import { Command } from 'commander';
import {
  ECSClient,
  DescribeClustersCommand,
  ListContainerInstancesCommand,
  DescribeContainerInstancesCommand,
} from '@aws-sdk/client-ecs';
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

// ============== cluster status ==============

const statusCommand = new Command('status')
  .description('查看 ECS 集群状态')
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

      // 获取集群信息
      const clusterResult = await ecsClient.send(
        new DescribeClustersCommand({
          clusters: [cluster],
        })
      );

      const clusterInfo = clusterResult.clusters?.[0];

      if (!clusterInfo) {
        throw new Error(`集群未找到: ${cluster}`);
      }

      // 获取容器实例
      const instancesResult = await ecsClient.send(
        new ListContainerInstancesCommand({ cluster })
      );

      const instanceArns = instancesResult.containerInstanceArns || [];
      let instances: any[] = [];

      if (instanceArns.length > 0) {
        const instanceDetails = await ecsClient.send(
          new DescribeContainerInstancesCommand({
            cluster,
            containerInstances: instanceArns,
          })
        );

        instances = (instanceDetails.containerInstances || []).map((i) => {
          const cpu = i.remainingResources?.find(r => r.name === 'CPU');
          const memory = i.remainingResources?.find(r => r.name === 'MEMORY');

          return {
            instanceId: i.ec2InstanceId,
            status: i.status,
            runningTasks: i.runningTasksCount,
            pendingTasks: i.pendingTasksCount,
            remainingCPU: cpu?.integerValue,
            remainingMemory: memory?.integerValue,
            agentConnected: i.agentConnected,
          };
        });
      }

      const status = {
        name: clusterInfo.clusterName,
        status: clusterInfo.status,
        runningTasksCount: clusterInfo.runningTasksCount,
        pendingTasksCount: clusterInfo.pendingTasksCount,
        activeServicesCount: clusterInfo.activeServicesCount,
        registeredContainerInstancesCount:
          clusterInfo.registeredContainerInstancesCount,
        instances,
      };

      if (isJsonOutput()) {
        outputSuccess({ cluster: status, environment: env });
      } else {
        console.log(chalk.bold(`\nECS 集群状态 - ${env}`));
        console.log(chalk.gray('─'.repeat(60)));

        console.log(`集群名称: ${chalk.cyan(clusterInfo.clusterName)}`);
        console.log(`状态: ${chalk.green(clusterInfo.status)}`);
        console.log(
          `运行中任务: ${chalk.white(clusterInfo.runningTasksCount)}`
        );
        console.log(
          `等待中任务: ${chalk.yellow(clusterInfo.pendingTasksCount)}`
        );
        console.log(
          `活跃服务数: ${chalk.white(clusterInfo.activeServicesCount)}`
        );
        console.log(
          `EC2 实例数: ${chalk.white(
            clusterInfo.registeredContainerInstancesCount
          )}`
        );

        if (instances.length > 0) {
          console.log(chalk.gray('\nEC2 实例:'));
          for (const instance of instances) {
            const statusIcon = instance.agentConnected
              ? chalk.green('✓')
              : chalk.red('✗');
            console.log(
              `  ${statusIcon} ${chalk.cyan(instance.instanceId)} ` +
                `任务: ${instance.runningTasks} ` +
                `CPU余: ${instance.remainingCPU} ` +
                `内存余: ${instance.remainingMemory}MB`
            );
          }
        }

        console.log();
      }
    } catch (error) {
      handleError(error);
    }
  });

export const clusterCommand = new Command('cluster')
  .description('ECS 集群管理')
  .addCommand(statusCommand);
