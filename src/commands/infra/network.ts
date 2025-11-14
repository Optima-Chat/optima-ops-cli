import { Command } from 'commander';
import chalk from 'chalk';
import Table from 'cli-table3';
import { getCurrentEnvironment, getCurrentEnvConfig, Environment } from '../../utils/config.js';
import { SSHClient } from '../../utils/ssh.js';
import {
  isJsonOutput,
  outputSuccess,
  printTitle,
  printSection,
} from '../../utils/output.js';
import { handleError } from '../../utils/error.js';

interface NetworkInterface {
  name: string;
  ipv4?: string;
  ipv6?: string;
  mac?: string;
  state: string;
  mtu?: string;
}

interface ContainerNetwork {
  container_id: string;
  container_name: string;
  network_mode: string;
  ipv4_address?: string;
  mac_address?: string;
  ports: string[];
}

interface DockerNetworkInfo {
  name: string;
  driver: string;
  scope: string;
  subnet?: string;
  gateway?: string;
  containers: number;
  created?: string;
}

interface NetworkInfo {
  environment: string;
  interfaces: NetworkInterface[];
  docker_networks: DockerNetworkInfo[];
  container_networks: ContainerNetwork[];
}

export const networkCommand = new Command('network')
  .description('查看 Docker 网络配置和容器网络信息')
  .option('--env <env>', '环境 (production/stage/development)')
  .option('--json', 'JSON 格式输出')
  .action(async (options) => {
    try {
      const env: Environment = options.env || getCurrentEnvironment();
      const envConfig = getCurrentEnvConfig();

      if (!isJsonOutput()) {
        printTitle(`🌐 网络配置 - ${env} 环境`);
      }

      const ssh = new SSHClient(env);
      await ssh.connect();

      const result: NetworkInfo = {
        environment: env,
        interfaces: [],
        docker_networks: [],
        container_networks: [],
      };

      try {
        // 获取主机网络接口
        const ipResult = await ssh.executeCommand('ip -o addr show');
        const ipLines = ipResult.stdout.trim().split('\n');

        for (const line of ipLines) {
          const parts = line.trim().split(/\s+/);
          if (parts.length >= 4 && parts[1] && parts[2] && parts[3]) {
            const ifName = parts[1];
            const addressType = parts[2];
            const address = parts[3];

            // 跳过 loopback
            if (ifName === 'lo') continue;

            // 查找或创建接口记录
            let iface = result.interfaces.find(i => i.name === ifName);
            if (!iface) {
              iface = {
                name: ifName,
                state: 'unknown',
              };
              result.interfaces.push(iface);
            }

            // 解析地址
            if (iface && addressType === 'inet') {
              iface.ipv4 = address.split('/')[0];
            } else if (iface && addressType === 'inet6') {
              iface.ipv6 = address.split('/')[0];
            }
          }
        }

        // 获取接口状态和 MTU
        for (const iface of result.interfaces) {
          try {
            const ifaceInfo = await ssh.executeCommand(`ip link show ${iface.name}`);
            const match = ifaceInfo.stdout.match(/state (\S+)/);
            if (match && match[1]) {
              iface.state = match[1];
            }
            const mtuMatch = ifaceInfo.stdout.match(/mtu (\d+)/);
            if (mtuMatch && mtuMatch[1]) {
              iface.mtu = mtuMatch[1];
            }
            const macMatch = ifaceInfo.stdout.match(/link\/ether ([0-9a-f:]+)/);
            if (macMatch && macMatch[1]) {
              iface.mac = macMatch[1];
            }
          } catch (error) {
            // 忽略单个接口错误
          }
        }

        // 获取 Docker 网络信息
        const dockerNetworksResult = await ssh.executeCommand(
          'docker network ls --format "{{.Name}}\t{{.Driver}}\t{{.Scope}}"'
        );
        const networkLines = dockerNetworksResult.stdout.trim().split('\n');

        for (const line of networkLines) {
          const parts = line.split('\t');
          if (parts.length >= 3 && parts[0] && parts[1] && parts[2]) {
            const networkName = parts[0];

            // 获取网络详细信息
            try {
              const inspectResult = await ssh.executeCommand(`docker network inspect ${networkName}`);
              const networkData = JSON.parse(inspectResult.stdout)[0];

              const subnet = networkData.IPAM?.Config?.[0]?.Subnet;
              const gateway = networkData.IPAM?.Config?.[0]?.Gateway;
              const containers = Object.keys(networkData.Containers || {}).length;

              result.docker_networks.push({
                name: networkName,
                driver: parts[1],
                scope: parts[2],
                subnet,
                gateway,
                containers,
                created: networkData.Created,
              });
            } catch (error) {
              // 网络详情获取失败，使用基本信息
              result.docker_networks.push({
                name: networkName,
                driver: parts[1],
                scope: parts[2],
                containers: 0,
              });
            }
          }
        }

        // 获取容器网络信息
        const containersResult = await ssh.executeCommand(
          'docker ps --format "{{.ID}}\t{{.Names}}"'
        );
        const containerLines = containersResult.stdout.trim().split('\n');

        for (const line of containerLines) {
          if (!line) continue;

          const parts = line.split('\t');
          if (parts.length >= 2 && parts[0] && parts[1]) {
            const containerId = parts[0];
            const containerName = parts[1];

            try {
              const inspectResult = await ssh.executeCommand(`docker inspect ${containerId}`);
              const containerData = JSON.parse(inspectResult.stdout)[0];

              const networkMode = containerData.HostConfig?.NetworkMode || 'default';
              const networks = containerData.NetworkSettings?.Networks || {};
              const networkNames = Object.keys(networks);
              const firstNetworkKey = networkNames[0];
              const firstNetwork = firstNetworkKey ? networks[firstNetworkKey] : undefined;

              // 端口映射
              const ports: string[] = [];
              const portBindings = containerData.HostConfig?.PortBindings || {};
              for (const [containerPort, hostBindings] of Object.entries(portBindings)) {
                if (Array.isArray(hostBindings)) {
                  for (const binding of hostBindings as any[]) {
                    const hostPort = binding.HostPort;
                    ports.push(`${hostPort}→${containerPort}`);
                  }
                }
              }

              result.container_networks.push({
                container_id: containerId,
                container_name: containerName,
                network_mode: networkMode,
                ipv4_address: firstNetwork?.IPAddress,
                mac_address: firstNetwork?.MacAddress,
                ports,
              });
            } catch (error) {
              // 容器网络信息获取失败，跳过
            }
          }
        }
      } catch (error: any) {
        throw new Error(`获取网络信息失败: ${error.message}`);
      } finally {
        await ssh.disconnect();
      }

      // 输出结果
      if (isJsonOutput()) {
        outputSuccess(result);
      } else {
        // 显示主机网络接口
        printSection('主机网络接口');
        if (result.interfaces.length > 0) {
          const ifaceTable = new Table({
            head: ['接口', '状态', 'IPv4', 'IPv6', 'MAC', 'MTU'],
            colWidths: [12, 10, 18, 28, 20, 8],
            wordWrap: true,
          });

          for (const iface of result.interfaces) {
            const stateDisplay =
              iface.state === 'UP'
                ? chalk.green(iface.state)
                : iface.state === 'DOWN'
                ? chalk.red(iface.state)
                : chalk.yellow(iface.state);

            ifaceTable.push([
              iface.name,
              stateDisplay,
              iface.ipv4 || 'N/A',
              iface.ipv6 || 'N/A',
              iface.mac || 'N/A',
              iface.mtu || 'N/A',
            ]);
          }
          console.log(ifaceTable.toString());
        } else {
          console.log(chalk.yellow('未找到网络接口'));
        }

        // 显示 Docker 网络
        printSection('Docker 网络');
        if (result.docker_networks.length > 0) {
          const dockerNetTable = new Table({
            head: ['网络名称', '驱动', '范围', '子网', '网关', '容器数'],
            colWidths: [20, 12, 10, 20, 18, 10],
            wordWrap: true,
          });

          for (const network of result.docker_networks) {
            dockerNetTable.push([
              network.name,
              network.driver,
              network.scope,
              network.subnet || 'N/A',
              network.gateway || 'N/A',
              network.containers.toString(),
            ]);
          }
          console.log(dockerNetTable.toString());
        } else {
          console.log(chalk.yellow('未找到 Docker 网络'));
        }

        // 显示容器网络
        printSection('容器网络');
        if (result.container_networks.length > 0) {
          const containerNetTable = new Table({
            head: ['容器名称', '网络模式', 'IP 地址', '端口映射'],
            colWidths: [30, 20, 18, 40],
            wordWrap: true,
          });

          for (const container of result.container_networks) {
            containerNetTable.push([
              container.container_name,
              container.network_mode,
              container.ipv4_address || 'N/A',
              container.ports.length > 0 ? container.ports.join(', ') : 'N/A',
            ]);
          }
          console.log(containerNetTable.toString());
        } else {
          console.log(chalk.yellow('未找到运行中的容器'));
        }

        // 重点网络提示
        const optimaNetwork = result.docker_networks.find(n => n.name === envConfig.dockerNetwork);
        if (optimaNetwork) {
          console.log();
          console.log(chalk.cyan(`📌 ${envConfig.dockerNetwork} 网络:`));
          console.log(chalk.gray(`  子网: ${optimaNetwork.subnet || 'N/A'}`));
          console.log(chalk.gray(`  网关: ${optimaNetwork.gateway || 'N/A'}`));
          console.log(chalk.gray(`  容器数: ${optimaNetwork.containers}`));
        }

        // 提示
        console.log();
        console.log(chalk.gray('💡 提示:'));
        console.log(chalk.gray('  - 使用 optima-ops services status 查看容器详细状态'));
        console.log(chalk.gray('  - 使用 optima-ops services inspect <service> 查看容器网络配置'));
      }
    } catch (error) {
      handleError(error);
    }
  });
