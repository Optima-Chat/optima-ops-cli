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

        // 并行获取两个环境的状态
        const [prod, stage] = await Promise.all([
          this.fetchEnvironmentHealth(prodUrl),
          this.fetchEnvironmentHealth(stageUrl),
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
  private async fetchEnvironmentHealth(healthEndpoint: string): Promise<EnvironmentHealth> {
    try {
      const startTime = Date.now();
      const response = await axios.get(healthEndpoint, {
        timeout: 3000,
        maxRedirects: 0, // stage MCP 307 必须返回给调用方
        validateStatus: () => true, // 接受所有状态码，不抛异常
      });
      const responseTime = Date.now() - startTime;

      // 只有 200 和 404 为健康，其他所有状态（包括 307, 502 等）都为不健康
      const health: 'healthy' | 'degraded' | 'unhealthy' =
        response.status === 200 || response.status === 404 ? 'healthy' : 'unhealthy';

      return {
        health,
        responseTime: health === 'healthy' ? responseTime : 0, // 不健康时不显示响应时间
        containerStatus: health === 'healthy' ? 'running' : 'stopped',
      };
    } catch (error: any) {
      // 网络错误、超时等
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
        memoryUsed,
        memoryTotal,
        diskUsed,
        diskTotal,
        disks,
        uptime,
      };
    } catch (error: any) {
      console.error(`获取 ${environment} EC2 数据失败:`, error.message);

      // 返回错误状态而不是 null
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
    const result = await this.executeSSHCommand(
      host,
      'docker stats --no-stream --format "{{.Name}}|{{.CPUPerc}}|{{.MemUsage}}|{{.NetIO}}"'
    );

    const lines = result.trim().split('\n');
    const stats: ContainerStats[] = lines
      .filter((line) => line.trim())
      .map((line) => {
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

        return {
          container: container || 'unknown',
          cpuPercent,
          memoryUsed,
          memoryTotal,
          networkRx,
          networkTx,
        };
      });

      return { stats };
    } catch (error: any) {
      console.error(`获取 ${environment} Docker 数据失败:`, error.message);
      const isTimeout = error.message?.includes('Timed out') || error.message?.includes('timeout');
      return {
        stats: [],
        error: error.message,
        offline: isTimeout,
      };
    }
  }

  /**
   * 执行 SSH 命令
   */
  private async executeSSHCommand(host: string, command: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const conn = new SSH2Client();
      const privateKey = fs.readFileSync(this.sshKeyPath, 'utf8');

      conn
        .on('ready', () => {
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
        .on('error', (err) => {
          reject(err);
        })
        .connect({
          host,
          port: 22,
          username: 'ec2-user',
          privateKey,
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
