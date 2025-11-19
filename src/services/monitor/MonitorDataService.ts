import axios from 'axios';
import { Client as SSH2Client } from 'ssh2';
import fs from 'fs';
import { getAllServices } from '../../utils/services-loader.js';
import type {
  ServiceHealth,
  EnvironmentHealth,
  EC2Stats,
  DockerStats,
  DiskStats,
  ContainerStats,
} from '../../types/monitor.js';

/**
 * 监控数据获取服务
 *
 * 从多个数据源获取监控数据：
 * - 服务健康：HTTP 健康检查端点
 * - EC2 资源：SSH 命令
 * - Docker 容器：SSH 命令
 */
export class MonitorDataService {
  private environment: string;
  private sshKeyPath: string;

  constructor(environment: string = 'production') {
    this.environment = environment;
    this.sshKeyPath = process.env.OPTIMA_SSH_KEY || `${process.env.HOME}/.ssh/optima-ec2-key`;
  }

  /**
   * 获取所有服务健康状态
   */
  async fetchServicesHealth(): Promise<ServiceHealth[]> {
    const allServices = getAllServices();

    const results = await Promise.all(
      allServices.map(async (svc) => {
        // prod 环境 URL
        const prodUrl = svc.healthEndpoint;

        // stage 环境 URL（替换域名）
        const stageUrl = prodUrl
          .replace('auth.optima.shop', 'auth-stage.optima.shop')
          .replace('mcp.optima.shop', 'mcp-stage.optima.shop')
          .replace('api.optima.shop', 'api-stage.optima.shop')
          .replace('ai.optima.shop', 'ai-stage.optima.shop')
          .replace('mcp-comfy.optima.shop', 'mcp-comfy-stage.optima.shop')
          .replace('mcp-fetch.optima.shop', 'mcp-fetch-stage.optima.shop')
          .replace('mcp-research.optima.shop', 'mcp-research-stage.optima.shop')
          .replace('mcp-shopify.optima.shop', 'mcp-shopify-stage.optima.shop')
          .replace('mcp-commerce.optima.shop', 'mcp-commerce-stage.optima.shop')
          .replace('mcp-ads.optima.shop', 'mcp-ads-stage.optima.shop');

        // 容器名称（prod 和 stage）
        const prodContainer = svc.container; // optima-xxx-prod
        const stageContainer = svc.container.replace('-prod', '-stage'); // optima-xxx-stage

        // 并行获取两个环境的状态
        const [prod, stage] = await Promise.all([
          this.fetchEnvironmentHealth(prodUrl, prodContainer, 'ec2-prod.optima.shop'),
          this.fetchEnvironmentHealth(stageUrl, stageContainer, 'ec2-stage.optima.shop'),
        ]);

        return {
          name: svc.name,
          type: svc.type,
          prod,
          stage,
        } as ServiceHealth;
      })
    );

    return results;
  }

  /**
   * 获取单个环境的健康状态
   */
  private async fetchEnvironmentHealth(
    healthEndpoint: string,
    containerName: string,
    host: string
  ): Promise<EnvironmentHealth> {
    try {
      // 并行：HTTP 健康检查 + 容器运行时长
      const [httpResult, uptimeResult] = await Promise.all([
        // HTTP 健康检查
        (async () => {
          try {
            const startTime = Date.now();
            const response = await axios.get(healthEndpoint, {
              timeout: 3000,
              maxRedirects: 0,
              validateStatus: () => true,
            });
            const responseTime = Date.now() - startTime;
            const health: 'healthy' | 'degraded' | 'unhealthy' =
              response.status === 200 || response.status === 404 ? 'healthy' : 'unhealthy';
            return { health, responseTime };
          } catch (error: any) {
            return { health: 'unhealthy' as const, responseTime: 0 };
          }
        })(),

        // 容器运行时长
        (async () => {
          try {
            const result = await this.executeSSHCommand(
              host,
              `docker inspect ${containerName} --format='{{.State.Status}}|{{.State.StartedAt}}'`
            );
            const [status, startedAt] = result.trim().split('|');

            if (status === 'running' && startedAt) {
              const start = new Date(startedAt);
              const now = new Date();
              const diffMs = now.getTime() - start.getTime();
              return { status, uptime: this.formatUptime(diffMs) };
            }

            return { status: status || 'unknown', uptime: undefined };
          } catch (error) {
            return { status: 'unknown', uptime: undefined };
          }
        })(),
      ]);

      return {
        health: httpResult.health,
        responseTime: httpResult.health === 'healthy' ? httpResult.responseTime : 0,
        containerStatus: uptimeResult.status,
        uptime: uptimeResult.uptime,
      };
    } catch (error: any) {
      return {
        health: 'unhealthy',
        responseTime: 0,
        containerStatus: 'unknown',
        error: error.message,
      };
    }
  }

  /**
   * 获取 EC2 资源使用情况
   * 注意：总是获取所有环境（production + stage + shared）
   */
  async fetchEC2Stats(): Promise<EC2Stats[]> {
    const results = await Promise.all([
      this.fetchEC2StatsForHost('ec2-prod.optima.shop', 'production'),
      this.fetchEC2StatsForHost('ec2-stage.optima.shop', 'stage'),
      this.fetchEC2StatsForHost('13.251.46.219', 'shared'),
    ]);

    // 返回所有结果，包括失败的（带 error 标记）
    return results.filter((r): r is EC2Stats => r !== null);
  }

  /**
   * 获取单个 EC2 实例的资源使用
   */
  private async fetchEC2StatsForHost(
    host: string,
    environment: 'production' | 'stage' | 'shared'
  ): Promise<EC2Stats | null> {
    try {
    // 实例信息
    const instanceIdResult = await this.executeSSHCommand(host, 'ec2-metadata --instance-id');
    const instanceId = instanceIdResult.trim().split(':')[1]?.trim() || 'unknown';

    const instanceTypeResult = await this.executeSSHCommand(host, 'ec2-metadata --instance-type');
    const instanceType = instanceTypeResult.trim().split(':')[1]?.trim() || 'unknown';

    // 运行时间
    const uptimeResult = await this.executeSSHCommand(host, 'uptime -p');
    const uptime = uptimeResult.trim();

    // CPU 使用率（通过 top 获取，1秒采样）
    const cpuResult = await this.executeSSHCommand(
      host,
      'top -bn2 -d 1 | grep "Cpu(s)" | tail -n 1 | awk \'{print $2}\' | cut -d\'%\' -f1'
    );
    const cpuUsage = parseFloat(cpuResult.trim()) || 0;

    // 内存使用
    const memResult = await this.executeSSHCommand(host, 'free -m | grep Mem:');
    const memParts = memResult.trim().split(/\s+/);
    const memoryTotal = parseInt(memParts[1] || '0', 10);
    const memoryUsed = parseInt(memParts[2] || '0', 10);

    // 磁盘使用（所有分区）
    const allDisksResult = await this.executeSSHCommand(
      host,
      'df -BG | grep -E "^/dev/" | grep -v "loop"'
    );
    const diskLines = allDisksResult.trim().split('\n');
    const disks: DiskStats[] = diskLines.map((line) => {
      const parts = line.trim().split(/\s+/);
      const total = parseInt(parts[1]?.replace('G', '') || '0', 10);
      const used = parseInt(parts[2]?.replace('G', '') || '0', 10);
      const percent = parseInt(parts[4]?.replace('%', '') || '0', 10);
      const mountPoint = parts[5] || '';
      return { mountPoint, used, total, percent };
    });

    // Root 卷（向后兼容）
    const rootDisk = disks.find((d) => d.mountPoint === '/');
    const diskUsed = rootDisk?.used || 0;
    const diskTotal = rootDisk?.total || 0;

      return {
        environment,
        instanceId,
        instanceType,
        cpuUsage,
        memoryUsed,
        memoryTotal,
        diskUsed,
        diskTotal,
        disks,
        uptime,
      };
    } catch (error: any) {
      // 不要用 console.error，会干扰 TUI 显示
      // dashboardLogger.debug(`获取 ${environment} EC2 数据失败:`, error.message);

      // 返回错误状态而不是 null（这是正常流程的一部分）
      const isTimeout = error.message?.includes('Timed out') || error.message?.includes('timeout');
      return {
        environment,
        instanceId: 'unknown',
        instanceType: 'unknown',
        memoryUsed: 0,
        memoryTotal: 0,
        diskUsed: 0,
        diskTotal: 0,
        uptime: 'unknown',
        error: error.message,
        offline: isTimeout, // SSH 超时判定为离线
      };
    }
  }

  /**
   * 获取 Docker 容器资源使用
   * 注意：总是获取所有环境（production + stage + shared）
   */
  async fetchDockerStats(): Promise<DockerStats[]> {
    const [prodResult, stageResult, sharedResult] = await Promise.all([
      this.fetchDockerStatsForHost('ec2-prod.optima.shop', 'production'),
      this.fetchDockerStatsForHost('ec2-stage.optima.shop', 'stage'),
      this.fetchDockerStatsForHost('13.251.46.219', 'shared'),
    ]);

    return [
      { environment: 'production', ...prodResult },
      { environment: 'stage', ...stageResult },
      { environment: 'shared', ...sharedResult },
    ];
  }

  /**
   * 获取单个主机的 Docker 容器资源
   * 返回值包含 stats 和可能的 error/offline 标记
   */
  private async fetchDockerStatsForHost(
    host: string,
    environment: 'production' | 'stage' | 'shared'
  ): Promise<{ stats: ContainerStats[]; error?: string; offline?: boolean }> {
    try {
    // 获取资源使用统计
    const result = await this.executeSSHCommand(
      host,
      'docker stats --no-stream --format "{{.Name}}|{{.CPUPerc}}|{{.MemUsage}}|{{.NetIO}}"'
    );

    const lines = result.trim().split('\n');
    const containerNames = lines.filter((line) => line.trim()).map((line) => line.split('|')[0]);

    // 并行获取每个容器的详细信息
    const statsPromises = lines
      .filter((line) => line.trim())
      .map(async (line) => {
        const [container, cpuStr, memStr, netStr] = line.split('|');

        // 解析 CPU
        const cpuPercent = parseFloat(cpuStr?.replace('%', '') || '0');

        // 解析内存 (e.g., "123.4MiB / 1.5GiB")
        const memParts = memStr?.split('/') || [];
        const memoryUsed = this.parseMemory(memParts[0]?.trim() || '0');
        const memoryTotal = this.parseMemory(memParts[1]?.trim() || '0');

        // 解析网络 (e.g., "1.2kB / 3.4kB")
        const netParts = netStr?.split('/') || [];
        const networkRx = this.parseBytes(netParts[0]?.trim() || '0');
        const networkTx = this.parseBytes(netParts[1]?.trim() || '0');

        // 获取容器详细信息
        const detailInfo = await this.fetchContainerDetails(host, container || 'unknown');

        return {
          container: container || 'unknown',
          cpuPercent,
          memoryUsed,
          memoryTotal,
          networkRx,
          networkTx,
          ...detailInfo, // 合并详细信息
        };
      });

    const stats = await Promise.all(statsPromises);

      return { stats };
    } catch (error: any) {
      // 不要用 console.error，会干扰 TUI 显示
      // dashboardLogger.debug(`获取 ${environment} Docker 数据失败:`, error.message);

      // 返回错误状态（这是正常流程的一部分）
      const isTimeout = error.message?.includes('Timed out') || error.message?.includes('timeout');
      return {
        stats: [],
        error: error.message,
        offline: isTimeout,
      };
    }
  }

  /**
   * 获取容器详细信息（状态、启动时间、镜像、构建信息等）
   */
  private async fetchContainerDetails(
    host: string,
    containerName: string
  ): Promise<Partial<ContainerStats>> {
    try {
      // 使用 docker inspect 获取 JSON 格式的详细信息
      const inspectResult = await this.executeSSHCommand(
        host,
        `docker inspect ${containerName}`
      );

      const inspectData = JSON.parse(inspectResult);
      if (!inspectData || inspectData.length === 0) {
        return {};
      }

      const container = inspectData[0];

      // 提取状态信息
      const status = container.State?.Status || 'unknown';
      const startedAt = container.State?.StartedAt || '';

      // 计算运行时长（如果正在运行）
      let uptime = 'unknown';
      if (status === 'running' && startedAt) {
        const start = new Date(startedAt);
        const now = new Date();
        const diffMs = now.getTime() - start.getTime();
        uptime = this.formatUptime(diffMs);
      }

      // 提取镜像信息
      const imageTag = container.Config?.Image || 'unknown';
      const imageId = container.Image?.substring(7, 19) || 'unknown'; // 取前12位

      // 提取构建信息（从镜像 labels）
      const labels = container.Config?.Labels || {};

      // Git commit
      const buildCommit = labels['org.opencontainers.image.revision'] ||
                         labels['git.commit'] ||
                         labels['vcs.revision'] ||
                         labels['COMMIT_SHA'];

      // Git 分支或 Tag
      // 优先使用 tag，如果没有 tag 则使用 branch
      const gitRef = labels['org.opencontainers.image.ref.name'] || // OCI 标准
                     labels['git.tag'] ||                           // 自定义 tag
                     labels['GITHUB_REF_NAME'] ||                   // GitHub Actions
                     labels['git.branch'] ||                        // 自定义 branch
                     labels['vcs.branch'];

      // 判断是 tag 还是 branch（如果以 v 开头或包含数字.数字，认为是 tag）
      const isTag = gitRef && (/^v\d+/.test(gitRef) || /\d+\.\d+/.test(gitRef));
      const buildBranch = !isTag ? gitRef : undefined;
      const buildTag = isTag ? gitRef : undefined;

      // Workflow 名称
      const buildWorkflow = labels['github.workflow'] ||
                           labels['ci.workflow'] ||
                           labels['GITHUB_WORKFLOW'];

      // 构建时间
      const buildTime = labels['org.opencontainers.image.created'] ||
                       labels['build.time'];

      return {
        status,
        startedAt,
        uptime,
        imageTag,
        imageId,
        buildCommit: buildCommit?.substring(0, 8), // 只保留前8位
        buildBranch,
        buildTag,
        buildWorkflow,
        buildTime,
      };
    } catch (error) {
      // 获取详细信息失败不影响基本统计，返回空对象
      return {};
    }
  }

  /**
   * 格式化运行时长
   */
  private formatUptime(milliseconds: number): string {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days}d ${hours % 24}h`;
    } else if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m`;
    } else {
      return `${seconds}s`;
    }
  }

  /**
   * 执行 SSH 命令
   */
  private async executeSSHCommand(host: string, command: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const conn = new SSH2Client();

      let privateKey: string;
      try {
        privateKey = fs.readFileSync(this.sshKeyPath, 'utf8');
      } catch (error: any) {
        reject(new Error(`Failed to read SSH key: ${error.message}`));
        return;
      }

      // 超时处理
      const timeout = setTimeout(() => {
        conn.end();
        reject(new Error('SSH connection timed out'));
      }, 10000);

      conn
        .on('ready', () => {
          clearTimeout(timeout);
          conn.exec(command, (err, stream) => {
            if (err) {
              conn.end();
              reject(err);
              return;
            }

            let stdout = '';
            let stderr = '';

            stream
              .on('close', () => {
                conn.end();
                if (stderr) {
                  reject(new Error(stderr));
                } else {
                  resolve(stdout);
                }
              })
              .on('data', (data: Buffer) => {
                stdout += data.toString();
              })
              .stderr.on('data', (data: Buffer) => {
                stderr += data.toString();
              });
          });
        })
        .on('error', (err: any) => {
          clearTimeout(timeout);
          // 提供更友好的错误信息
          let message = err.message || String(err);

          // 常见错误的友好提示
          if (message.includes('ENOTFOUND')) {
            message = `DNS lookup failed for ${host}`;
          } else if (message.includes('ECONNREFUSED')) {
            message = `Connection refused by ${host}`;
          } else if (message.includes('ETIMEDOUT')) {
            message = `Connection timeout to ${host}`;
          } else if (message.includes('All configured authentication methods failed')) {
            message = `SSH authentication failed for ${host}`;
          }

          reject(new Error(message));
        })
        .connect({
          host,
          port: 22,
          username: 'ec2-user',
          privateKey,
          // ssh2 库不会验证 host key，因此 EC2 重建后可以直接连接
          // 如果用户的 ~/.ssh/known_hosts 有旧 key，需要手动清理或配置 SSH
        });
    });
  }

  /**
   * 解析内存字符串（支持 B, KiB, MiB, GiB）
   */
  private parseMemory(str: string): number {
    const match = str.match(/^([\d.]+)([KMGT]i?B?)$/);
    if (!match) return 0;

    const value = parseFloat(match[1]);
    const unit = match[2];

    const multipliers: Record<string, number> = {
      B: 1,
      KiB: 1024,
      MiB: 1024 * 1024,
      GiB: 1024 * 1024 * 1024,
      TiB: 1024 * 1024 * 1024 * 1024,
      KB: 1000,
      MB: 1000 * 1000,
      GB: 1000 * 1000 * 1000,
      TB: 1000 * 1000 * 1000 * 1000,
    };

    return value * (multipliers[unit] || 1);
  }

  /**
   * 解析字节字符串（支持 B, kB, MB, GB）
   */
  private parseBytes(str: string): number {
    const match = str.match(/^([\d.]+)([kMGT]?B?)$/);
    if (!match) return 0;

    const value = parseFloat(match[1]);
    const unit = match[2];

    const multipliers: Record<string, number> = {
      B: 1,
      kB: 1000,
      MB: 1000 * 1000,
      GB: 1000 * 1000 * 1000,
      TB: 1000 * 1000 * 1000 * 1000,
    };

    return value * (multipliers[unit] || 1);
  }

}
