import { Command } from 'commander';
import {
  ECSClient,
  ListTasksCommand,
  DescribeTasksCommand,
  DescribeTaskDefinitionCommand,
} from '@aws-sdk/client-ecs';
import chalk from 'chalk';
import {
  resolveEnvironment,
  getECSCluster,
  getAWSRegion,
} from '../../utils/config.js';
import { handleError } from '../../utils/error.js';
import { isJsonOutput, outputSuccess } from '../../utils/output.js';

const ecsClient = new ECSClient({ region: getAWSRegion() });

// ============== tasks list ==============

const listCommand = new Command('list')
  .description('列出 ECS 任务')
  .option('--env <env>', '环境 (ecs-stage|ecs-prod)')
  .option('--service <service>', '过滤指定服务')
  .option('--json', 'JSON 输出')
  .action(async (options) => {
    try {
      const env = resolveEnvironment(options.env);
      const cluster = getECSCluster(env);

      // 构造服务名（如果指定）
      let serviceName: string | undefined;
      if (options.service) {
        serviceName = options.service.startsWith('optima-')
          ? options.service
          : `optima-${env.split('-')[1]}-${options.service}`;
      }

      // 获取任务列表
      const listResult = await ecsClient.send(
        new ListTasksCommand({
          cluster,
          serviceName,
        })
      );

      const taskArns = listResult.taskArns || [];

      if (taskArns.length === 0) {
        if (isJsonOutput()) {
          outputSuccess({ tasks: [], cluster, environment: env });
        } else {
          console.log(chalk.yellow('没有运行中的任务'));
        }
        return;
      }

      // 获取任务详情
      const describeResult = await ecsClient.send(
        new DescribeTasksCommand({
          cluster,
          tasks: taskArns,
        })
      );

      const tasks = (describeResult.tasks || []).map((t) => {
        const container = t.containers?.[0];
        return {
          taskId: t.taskArn?.split('/').pop(),
          taskDefinition: t.taskDefinitionArn?.split('/').pop(),
          lastStatus: t.lastStatus,
          desiredStatus: t.desiredStatus,
          healthStatus: t.healthStatus,
          cpu: t.cpu,
          memory: t.memory,
          startedAt: t.startedAt,
          containerName: container?.name,
          containerStatus: container?.lastStatus,
        };
      });

      if (isJsonOutput()) {
        outputSuccess({ tasks, cluster, environment: env });
      } else {
        console.log(chalk.bold(`\nECS 任务列表 - ${env}`));
        console.log(chalk.gray(`集群: ${cluster}`));
        if (serviceName) {
          console.log(chalk.gray(`服务: ${serviceName}`));
        }
        console.log(chalk.gray('─'.repeat(80)));

        for (const task of tasks) {
          const statusIcon =
            task.lastStatus === 'RUNNING' ? chalk.green('✓') : chalk.yellow('○');

          const uptime = task.startedAt
            ? formatUptime(new Date(task.startedAt))
            : '-';

          console.log(
            `${statusIcon} ${chalk.cyan(task.taskId?.substring(0, 12))} ` +
              `${chalk.gray(task.taskDefinition?.substring(0, 30)?.padEnd(30))} ` +
              `${task.lastStatus?.padEnd(10)} ` +
              `${chalk.gray(uptime)}`
          );
        }

        console.log(chalk.gray('─'.repeat(80)));
        console.log(`共 ${tasks.length} 个任务\n`);
      }
    } catch (error) {
      handleError(error);
    }
  });

// ============== tasks describe ==============

const describeCommand = new Command('describe')
  .description('查看 ECS 任务详情')
  .argument('<task-id>', '任务 ID')
  .option('--env <env>', '环境 (ecs-stage|ecs-prod)')
  .option('--json', 'JSON 输出')
  .action(async (taskId, options) => {
    try {
      const env = resolveEnvironment(options.env);
      const cluster = getECSCluster(env);

      // 获取任务详情
      const result = await ecsClient.send(
        new DescribeTasksCommand({
          cluster,
          tasks: [taskId],
        })
      );

      const task = result.tasks?.[0];

      if (!task) {
        throw new Error(`任务未找到: ${taskId}`);
      }

      // 获取任务定义详情
      let taskDefDetails: any = null;
      if (task.taskDefinitionArn) {
        const defResult = await ecsClient.send(
          new DescribeTaskDefinitionCommand({
            taskDefinition: task.taskDefinitionArn,
          })
        );
        taskDefDetails = defResult.taskDefinition;
      }

      const details = {
        taskId: task.taskArn?.split('/').pop(),
        taskDefinition: task.taskDefinitionArn?.split('/').pop(),
        lastStatus: task.lastStatus,
        desiredStatus: task.desiredStatus,
        healthStatus: task.healthStatus,
        cpu: task.cpu,
        memory: task.memory,
        startedAt: task.startedAt,
        stoppedAt: task.stoppedAt,
        stoppedReason: task.stoppedReason,
        containers: task.containers?.map((c) => ({
          name: c.name,
          lastStatus: c.lastStatus,
          healthStatus: c.healthStatus,
          exitCode: c.exitCode,
          reason: c.reason,
          networkBindings: c.networkBindings,
          networkInterfaces: c.networkInterfaces,
        })),
        containerDefinitions: taskDefDetails?.containerDefinitions?.map(
          (cd: any) => ({
            name: cd.name,
            image: cd.image,
            cpu: cd.cpu,
            memory: cd.memory,
            portMappings: cd.portMappings,
            essential: cd.essential,
          })
        ),
      };

      if (isJsonOutput()) {
        outputSuccess({ task: details, cluster, environment: env });
      } else {
        console.log(chalk.bold(`\n任务详情: ${details.taskId}`));
        console.log(chalk.gray('─'.repeat(60)));

        console.log(`状态: ${getStatusColor(details.lastStatus)(details.lastStatus)}`);
        console.log(`健康: ${details.healthStatus || 'UNKNOWN'}`);
        console.log(`CPU: ${details.cpu} 单位`);
        console.log(`内存: ${details.memory} MB`);

        if (details.startedAt) {
          console.log(`启动时间: ${new Date(details.startedAt).toLocaleString()}`);
          console.log(`运行时长: ${formatUptime(new Date(details.startedAt))}`);
        }

        if (details.stoppedAt) {
          console.log(`停止时间: ${new Date(details.stoppedAt).toLocaleString()}`);
        }

        if (details.stoppedReason) {
          console.log(`停止原因: ${chalk.yellow(details.stoppedReason)}`);
        }

        console.log(chalk.gray('\n容器:'));
        for (const container of details.containers || []) {
          const statusIcon =
            container.lastStatus === 'RUNNING'
              ? chalk.green('✓')
              : chalk.yellow('○');
          console.log(
            `  ${statusIcon} ${chalk.cyan(container.name)} - ${container.lastStatus}`
          );
          if (container.exitCode !== undefined) {
            console.log(`     退出码: ${container.exitCode}`);
          }
          if (container.reason) {
            console.log(`     原因: ${container.reason}`);
          }
        }

        console.log();
      }
    } catch (error) {
      handleError(error);
    }
  });

// ============== 辅助函数 ==============

function formatUptime(startTime: Date): string {
  const diff = Date.now() - startTime.getTime();
  const hours = Math.floor(diff / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);

  if (hours > 24) {
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
  }

  return `${hours}h ${minutes}m`;
}

function getStatusColor(status: string | undefined) {
  switch (status) {
    case 'RUNNING':
      return chalk.green;
    case 'PENDING':
    case 'PROVISIONING':
      return chalk.yellow;
    case 'STOPPED':
    case 'DEPROVISIONING':
      return chalk.red;
    default:
      return chalk.white;
  }
}

export const tasksCommand = new Command('tasks')
  .description('ECS 任务管理')
  .addCommand(listCommand)
  .addCommand(describeCommand);
