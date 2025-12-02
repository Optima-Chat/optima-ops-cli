import { Command } from 'commander';
import {
  CloudWatchClient,
  GetMetricStatisticsCommand,
  Statistic,
} from '@aws-sdk/client-cloudwatch';
import {
  ECSClient,
  ListServicesCommand,
  DescribeServicesCommand,
} from '@aws-sdk/client-ecs';
import chalk from 'chalk';
import {
  resolveEnvironment,
  getECSCluster,
  getAWSRegion,
} from '../../utils/config.js';
import { handleError } from '../../utils/error.js';
import { isJsonOutput, outputSuccess } from '../../utils/output.js';

const cwClient = new CloudWatchClient({ region: getAWSRegion() });
const ecsClient = new ECSClient({ region: getAWSRegion() });

// ============== metrics service ==============

const serviceCommand = new Command('service')
  .description('查看 ECS 服务的 CPU/内存使用率')
  .argument('<service>', '服务名称')
  .option('--env <env>', '环境 (ecs-stage|ecs-prod)')
  .option('--period <minutes>', '时间范围（分钟）', '60')
  .option('--json', 'JSON 输出')
  .action(async (serviceName, options) => {
    try {
      const env = resolveEnvironment(options.env);
      const cluster = getECSCluster(env);
      const period = parseInt(options.period) || 60;

      // 构造完整服务名
      const fullServiceName = serviceName.startsWith('optima-')
        ? serviceName
        : `optima-${env.split('-')[1]}-${serviceName}`;

      const endTime = new Date();
      const startTime = new Date(endTime.getTime() - period * 60 * 1000);

      // 获取 CPU 使用率
      const cpuResult = await cwClient.send(
        new GetMetricStatisticsCommand({
          Namespace: 'AWS/ECS',
          MetricName: 'CPUUtilization',
          Dimensions: [
            { Name: 'ClusterName', Value: cluster },
            { Name: 'ServiceName', Value: fullServiceName },
          ],
          StartTime: startTime,
          EndTime: endTime,
          Period: 300, // 5 分钟粒度
          Statistics: [Statistic.Average, Statistic.Maximum],
        })
      );

      // 获取内存使用率
      const memResult = await cwClient.send(
        new GetMetricStatisticsCommand({
          Namespace: 'AWS/ECS',
          MetricName: 'MemoryUtilization',
          Dimensions: [
            { Name: 'ClusterName', Value: cluster },
            { Name: 'ServiceName', Value: fullServiceName },
          ],
          StartTime: startTime,
          EndTime: endTime,
          Period: 300,
          Statistics: [Statistic.Average, Statistic.Maximum],
        })
      );

      const cpuDatapoints = cpuResult.Datapoints || [];
      const memDatapoints = memResult.Datapoints || [];

      // 计算平均值和最大值
      const cpuAvg =
        cpuDatapoints.length > 0
          ? cpuDatapoints.reduce((sum, d) => sum + (d.Average || 0), 0) /
            cpuDatapoints.length
          : 0;
      const cpuMax = Math.max(...cpuDatapoints.map((d) => d.Maximum || 0), 0);

      const memAvg =
        memDatapoints.length > 0
          ? memDatapoints.reduce((sum, d) => sum + (d.Average || 0), 0) /
            memDatapoints.length
          : 0;
      const memMax = Math.max(...memDatapoints.map((d) => d.Maximum || 0), 0);

      const metrics = {
        service: fullServiceName,
        cluster,
        environment: env,
        period: `${period} 分钟`,
        cpu: {
          average: cpuAvg.toFixed(2),
          maximum: cpuMax.toFixed(2),
          unit: '%',
          datapoints: cpuDatapoints.length,
        },
        memory: {
          average: memAvg.toFixed(2),
          maximum: memMax.toFixed(2),
          unit: '%',
          datapoints: memDatapoints.length,
        },
      };

      if (isJsonOutput()) {
        outputSuccess(metrics);
      } else {
        console.log(chalk.bold(`\n服务指标: ${fullServiceName}`));
        console.log(chalk.gray(`环境: ${env} | 集群: ${cluster}`));
        console.log(chalk.gray(`时间范围: 最近 ${period} 分钟`));
        console.log(chalk.gray('─'.repeat(50)));

        if (cpuDatapoints.length === 0 && memDatapoints.length === 0) {
          console.log(chalk.yellow('没有可用的指标数据'));
          console.log(chalk.gray('服务可能刚启动或尚未运行'));
        } else {
          console.log(chalk.cyan('\nCPU 使用率:'));
          console.log(`  平均: ${getColoredPercent(cpuAvg)}%`);
          console.log(`  最大: ${getColoredPercent(cpuMax)}%`);

          console.log(chalk.cyan('\n内存使用率:'));
          console.log(`  平均: ${getColoredPercent(memAvg)}%`);
          console.log(`  最大: ${getColoredPercent(memMax)}%`);
        }

        console.log();
      }
    } catch (error) {
      handleError(error);
    }
  });

// ============== metrics cluster ==============

const clusterCommand = new Command('cluster')
  .description('查看 ECS 集群所有服务的资源使用概览')
  .option('--env <env>', '环境 (ecs-stage|ecs-prod)')
  .option('--json', 'JSON 输出')
  .action(async (options) => {
    try {
      const env = resolveEnvironment(options.env);
      const cluster = getECSCluster(env);

      // 获取所有服务
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

      const endTime = new Date();
      const startTime = new Date(endTime.getTime() - 60 * 60 * 1000); // 最近1小时

      // 获取每个服务的指标
      const servicesMetrics = await Promise.all(
        (describeResult.services || []).map(async (svc) => {
          const serviceName = svc.serviceName || '';

          const [cpuResult, memResult] = await Promise.all([
            cwClient.send(
              new GetMetricStatisticsCommand({
                Namespace: 'AWS/ECS',
                MetricName: 'CPUUtilization',
                Dimensions: [
                  { Name: 'ClusterName', Value: cluster },
                  { Name: 'ServiceName', Value: serviceName },
                ],
                StartTime: startTime,
                EndTime: endTime,
                Period: 300,
                Statistics: [Statistic.Average],
              })
            ),
            cwClient.send(
              new GetMetricStatisticsCommand({
                Namespace: 'AWS/ECS',
                MetricName: 'MemoryUtilization',
                Dimensions: [
                  { Name: 'ClusterName', Value: cluster },
                  { Name: 'ServiceName', Value: serviceName },
                ],
                StartTime: startTime,
                EndTime: endTime,
                Period: 300,
                Statistics: [Statistic.Average],
              })
            ),
          ]);

          const cpuDatapoints = cpuResult.Datapoints || [];
          const memDatapoints = memResult.Datapoints || [];

          const cpuAvg =
            cpuDatapoints.length > 0
              ? cpuDatapoints.reduce((sum, d) => sum + (d.Average || 0), 0) /
                cpuDatapoints.length
              : null;

          const memAvg =
            memDatapoints.length > 0
              ? memDatapoints.reduce((sum, d) => sum + (d.Average || 0), 0) /
                memDatapoints.length
              : null;

          return {
            name: serviceName,
            runningCount: svc.runningCount,
            desiredCount: svc.desiredCount,
            cpuAvg,
            memAvg,
          };
        })
      );

      if (isJsonOutput()) {
        outputSuccess({
          services: servicesMetrics,
          cluster,
          environment: env,
        });
      } else {
        console.log(chalk.bold(`\n集群资源概览 - ${env}`));
        console.log(chalk.gray(`集群: ${cluster}`));
        console.log(chalk.gray('─'.repeat(80)));

        console.log(
          chalk.gray(
            '服务名称'.padEnd(35) +
              '任务'.padEnd(10) +
              'CPU'.padEnd(15) +
              '内存'.padEnd(15)
          )
        );
        console.log(chalk.gray('─'.repeat(80)));

        for (const svc of servicesMetrics) {
          const tasks = `${svc.runningCount}/${svc.desiredCount}`;
          const cpu =
            svc.cpuAvg !== null ? `${svc.cpuAvg.toFixed(1)}%` : 'N/A';
          const mem =
            svc.memAvg !== null ? `${svc.memAvg.toFixed(1)}%` : 'N/A';

          const cpuColor =
            svc.cpuAvg !== null ? getColoredPercent(svc.cpuAvg) : chalk.gray(cpu);
          const memColor =
            svc.memAvg !== null ? getColoredPercent(svc.memAvg) : chalk.gray(mem);

          console.log(
            `${chalk.cyan(svc.name?.padEnd(35))} ` +
              `${tasks.padEnd(10)} ` +
              `${cpuColor.toString().padEnd(15)} ` +
              `${memColor}`
          );
        }

        console.log(chalk.gray('─'.repeat(80)));
        console.log(`共 ${servicesMetrics.length} 个服务\n`);
      }
    } catch (error) {
      handleError(error);
    }
  });

// ============== 辅助函数 ==============

function getColoredPercent(value: number): string {
  const formatted = value.toFixed(1);
  if (value >= 80) {
    return chalk.red(formatted);
  } else if (value >= 60) {
    return chalk.yellow(formatted);
  } else {
    return chalk.green(formatted);
  }
}

export const metricsCommand = new Command('metrics')
  .description('ECS CloudWatch 指标查询（免费）')
  .addCommand(serviceCommand)
  .addCommand(clusterCommand);
