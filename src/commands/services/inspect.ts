import { Command } from 'commander';
import chalk from 'chalk';
import { getCurrentEnvironment, getCurrentEnvConfig, Environment } from '../../utils/config.js';
import { SSHClient } from '../../utils/ssh.js';
import {
  isJsonOutput,
  outputSuccess,
  printTitle,
  printKeyValue,
  maskSensitive,
} from '../../utils/output.js';
import { handleError } from '../../utils/error.js';
import { selectService } from '../../utils/prompt.js';

export const inspectCommand = new Command('inspect')
  .description('查看容器详细配置')
  .argument('[service]', '服务名称')
  .option('--env <env>', '环境 (production/stage/development)')
  .option('--json', 'JSON 格式输出')
  .action(async (service, options) => {
    try {
      const env: Environment = options.env || getCurrentEnvironment();
      const envConfig = getCurrentEnvConfig();
      const services = [...envConfig.services];

      // 选择服务（交互式）
      if (!service) {
        service = await selectService(services, '选择要检查的服务:');
      } else if (!services.includes(service)) {
        throw new Error(`未知服务: ${service}`);
      }

      const containerName = `optima-${service}-${env === 'production' ? 'prod' : env}`;

      if (!isJsonOutput()) {
        printTitle(`🔍 ${service} 容器配置 - ${env} 环境`);
      }

      // 连接 SSH
      const ssh = new SSHClient(env);
      await ssh.connect();

      try {
        // 获取容器详细信息
        const inspectResult = await ssh.executeCommand(
          `docker inspect ${containerName}`,
          { maskOutput: true }
        );

        if (inspectResult.exitCode !== 0) {
          throw new Error(inspectResult.stderr || '容器不存在');
        }

        const inspectData = JSON.parse(inspectResult.stdout)[0];

        if (isJsonOutput()) {
          // JSON 输出：完整的 docker inspect 结果（已脱敏）
          outputSuccess({
            service,
            environment: env,
            container_name: containerName,
            inspect: inspectData,
          });
        } else {
          // 人类可读输出：提取关键信息
          console.log(chalk.cyan('\n基本信息:'));
          printKeyValue('容器ID', inspectData.Id.substring(0, 12), 1);
          printKeyValue('容器名', inspectData.Name.replace('/', ''), 1);
          printKeyValue('镜像', inspectData.Config.Image, 1);
          printKeyValue('状态', inspectData.State.Status, 1);
          printKeyValue('创建时间', new Date(inspectData.Created).toLocaleString('zh-CN'), 1);

          if (inspectData.State.Running) {
            printKeyValue('启动时间', new Date(inspectData.State.StartedAt).toLocaleString('zh-CN'), 1);
          }

          // 网络信息
          console.log(chalk.cyan('\n网络配置:'));
          const networks = Object.keys(inspectData.NetworkSettings.Networks);
          for (const network of networks) {
            const netConfig = inspectData.NetworkSettings.Networks[network];
            console.log(chalk.white(`  ${network}:`));
            printKeyValue('IP 地址', netConfig.IPAddress || '-', 2);
            printKeyValue('网关', netConfig.Gateway || '-', 2);
            printKeyValue('MAC 地址', netConfig.MacAddress || '-', 2);
          }

          // 端口映射
          console.log(chalk.cyan('\n端口映射:'));
          const ports = inspectData.NetworkSettings.Ports;
          if (ports && Object.keys(ports).length > 0) {
            for (const [containerPort, hostBindings] of Object.entries(ports)) {
              if (hostBindings && Array.isArray(hostBindings)) {
                for (const binding of hostBindings as any[]) {
                  printKeyValue(
                    containerPort,
                    `${binding.HostIp}:${binding.HostPort}`,
                    1
                  );
                }
              } else {
                printKeyValue(containerPort, '未映射', 1);
              }
            }
          } else {
            console.log(chalk.gray('  无端口映射'));
          }

          // 挂载卷
          console.log(chalk.cyan('\n挂载卷:'));
          const mounts = inspectData.Mounts;
          if (mounts && mounts.length > 0) {
            for (const mount of mounts) {
              console.log(chalk.white(`  ${mount.Type}:`));
              printKeyValue('源', mount.Source, 2);
              printKeyValue('目标', mount.Destination, 2);
              printKeyValue('读写', mount.RW ? '读写' : '只读', 2);
            }
          } else {
            console.log(chalk.gray('  无挂载卷'));
          }

          // 环境变量（脱敏）
          console.log(chalk.cyan('\n环境变量:'));
          const envVars = inspectData.Config.Env;
          if (envVars && envVars.length > 0) {
            const displayed = envVars
              .slice(0, 10)
              .map((v: string) => maskSensitive(v));
            for (const envVar of displayed) {
              const [key, ...valueParts] = envVar.split('=');
              const value = valueParts.join('=');
              printKeyValue(key, value || '(空)', 1);
            }
            if (envVars.length > 10) {
              console.log(chalk.gray(`  ... 还有 ${envVars.length - 10} 个环境变量`));
            }
          } else {
            console.log(chalk.gray('  无环境变量'));
          }

          // 资源限制
          console.log(chalk.cyan('\n资源限制:'));
          const hostConfig = inspectData.HostConfig;
          printKeyValue(
            'CPU 限制',
            hostConfig.NanoCpus ? `${hostConfig.NanoCpus / 1e9} 核` : '无限制',
            1
          );
          printKeyValue(
            '内存限制',
            hostConfig.Memory ? `${(hostConfig.Memory / 1024 / 1024).toFixed(0)} MB` : '无限制',
            1
          );

          // 重启策略
          console.log(chalk.cyan('\n重启策略:'));
          printKeyValue('策略', hostConfig.RestartPolicy.Name || 'no', 1);
          if (hostConfig.RestartPolicy.MaximumRetryCount) {
            printKeyValue('最大重试', hostConfig.RestartPolicy.MaximumRetryCount.toString(), 1);
          }

          console.log(chalk.gray('\n提示: 使用 --json 参数可查看完整配置\n'));
        }
      } finally {
        ssh.disconnect();
      }
    } catch (error) {
      handleError(error);
    }
  });
