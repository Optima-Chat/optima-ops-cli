import { Client, ConnectConfig } from 'ssh2';
import { getEC2Config, getSSHPrivateKey, Environment } from './config.js';
import { SSHConnectionError, CommandExecutionError } from './error.js';
import { maskSensitive } from './output.js';

// ============== SSH 命令白名单 ==============

// 只读命令（完全安全）
const READONLY_COMMANDS = [
  'docker ps',
  'docker logs',
  'docker inspect',
  'docker stats',
  'docker network',
  'docker images',
  'ip ',
  'ip-',
  'df -h',
  'free -h',
  'systemctl status',
  'journalctl',
  'cat',
  'grep',
  'ls',
  'find',
  'tail',
  'head',
  'echo',
  'pwd',
  'whoami',
  'uptime',
  'date',
  'wc',
];

// 低风险命令（需要确认）
const LOWRISK_COMMANDS = [
  'docker-compose restart',
  'docker restart',
  'systemctl restart',
];

// 危险命令（禁止）
const DANGEROUS_COMMANDS = [
  'rm ',
  'docker rm',
  'docker system prune',
  'docker volume rm',
  'kill ',
  'shutdown',
  'reboot',
  'poweroff',
  ' > ',
  ' >> ',
  ';',
  '&&',
  '||',
];

/**
 * 验证命令是否安全
 */
export function validateCommand(command: string): { safe: boolean; reason?: string } {
  const cmd = command.trim().toLowerCase();

  // 检查危险命令
  for (const dangerous of DANGEROUS_COMMANDS) {
    if (cmd.includes(dangerous.toLowerCase())) {
      return {
        safe: false,
        reason: `命令包含危险操作: ${dangerous}`,
      };
    }
  }

  // 特殊检查：管道符（但允许在引号内）
  // 匹配引号外的管道符
  const outsideQuotes = command.replace(/"[^"]*"/g, '').replace(/'[^']*'/g, '');
  if (outsideQuotes.includes('|')) {
    return {
      safe: false,
      reason: '命令包含危险操作: |',
    };
  }

  // 检查是否是只读命令
  for (const readonly of READONLY_COMMANDS) {
    if (cmd.startsWith(readonly.toLowerCase())) {
      return { safe: true };
    }
  }

  // 检查是否是低风险命令
  for (const lowrisk of LOWRISK_COMMANDS) {
    if (cmd.startsWith(lowrisk.toLowerCase())) {
      return { safe: true };
    }
  }

  // 其他命令需要警告
  return {
    safe: false,
    reason: '命令未在白名单中',
  };
}

// ============== SSH 客户端 ==============

export interface SSHCommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  command: string;
  executionTime: number;
}

/**
 * SSH 客户端类
 */
export class SSHClient {
  private client: Client;
  private connected = false;
  private env: Environment;

  constructor(env?: Environment) {
    this.client = new Client();
    this.env = env || 'production';
  }

  /**
   * 连接到 EC2
   */
  async connect(): Promise<void> {
    if (this.connected) {
      return;
    }

    const ec2Config = getEC2Config(this.env);
    const privateKey = getSSHPrivateKey(this.env);

    const config: ConnectConfig = {
      host: ec2Config.host,
      port: 22,
      username: ec2Config.user,
      privateKey,
      readyTimeout: 30000,
      keepaliveInterval: 10000,
    };

    return new Promise((resolve, reject) => {
      this.client
        .on('ready', () => {
          this.connected = true;
          resolve();
        })
        .on('error', (err) => {
          reject(new SSHConnectionError(
            `无法连接到 ${ec2Config.host}: ${err.message}`,
            { host: ec2Config.host, error: err.message }
          ));
        })
        .connect(config);
    });
  }

  /**
   * 断开连接
   */
  disconnect(): void {
    if (this.connected) {
      this.client.end();
      this.connected = false;
    }
  }

  /**
   * 执行命令
   */
  async executeCommand(
    command: string,
    options?: {
      validateSafety?: boolean;
      timeout?: number;
      maskOutput?: boolean;
    }
  ): Promise<SSHCommandResult> {
    const startTime = Date.now();

    // 安全检查
    if (options?.validateSafety !== false) {
      const validation = validateCommand(command);
      if (!validation.safe) {
        throw new CommandExecutionError(
          `命令被安全策略阻止: ${validation.reason}`,
          { command, reason: validation.reason }
        );
      }
    }

    // 确保已连接
    if (!this.connected) {
      await this.connect();
    }

    return new Promise((resolve, reject) => {
      let stdout = '';
      let stderr = '';

      const timeout = options?.timeout || 60000;
      const timer = setTimeout(() => {
        reject(new CommandExecutionError(
          `命令执行超时 (${timeout}ms)`,
          { command }
        ));
      }, timeout);

      this.client.exec(command, (err, stream) => {
        if (err) {
          clearTimeout(timer);
          reject(new CommandExecutionError(
            `命令执行失败: ${err.message}`,
            { command, error: err.message }
          ));
          return;
        }

        stream
          .on('close', (exitCode: number) => {
            clearTimeout(timer);
            const executionTime = Date.now() - startTime;

            // 脱敏输出
            const finalStdout = options?.maskOutput ? maskSensitive(stdout) : stdout;
            const finalStderr = options?.maskOutput ? maskSensitive(stderr) : stderr;

            resolve({
              stdout: finalStdout,
              stderr: finalStderr,
              exitCode,
              command,
              executionTime,
            });
          })
          .on('data', (data: Buffer) => {
            stdout += data.toString();
          })
          .stderr.on('data', (data: Buffer) => {
            stderr += data.toString();
          });
      });
    });
  }

  /**
   * 执行多个命令（串行）
   */
  async executeCommands(commands: string[]): Promise<SSHCommandResult[]> {
    const results: SSHCommandResult[] = [];

    for (const command of commands) {
      const result = await this.executeCommand(command);
      results.push(result);

      // 如果命令失败，停止执行
      if (result.exitCode !== 0) {
        break;
      }
    }

    return results;
  }

  /**
   * 执行 Docker 命令
   */
  async dockerCommand(command: string): Promise<SSHCommandResult> {
    return this.executeCommand(`docker ${command}`);
  }

  /**
   * 执行 docker-compose 命令
   */
  async dockerComposeCommand(service: string, command: string): Promise<SSHCommandResult> {
    return this.executeCommand(`cd /opt/${service} && docker-compose ${command}`);
  }

  /**
   * 获取容器状态
   */
  async getContainerStatus(containerName?: string): Promise<SSHCommandResult> {
    const filter = containerName ? ` --filter "name=${containerName}"` : '';
    return this.dockerCommand(`ps -a${filter} --format "{{.ID}}\\t{{.Names}}\\t{{.Status}}\\t{{.Ports}}"`);
  }

  /**
   * 获取容器日志
   */
  async getContainerLogs(
    containerName: string,
    options?: { tail?: number; follow?: boolean }
  ): Promise<SSHCommandResult> {
    const tail = options?.tail ? `--tail ${options.tail}` : '';
    const follow = options?.follow ? '-f' : '';
    return this.dockerCommand(`logs ${tail} ${follow} ${containerName}`);
  }

  /**
   * 检查文件是否存在
   */
  async fileExists(path: string): Promise<boolean> {
    const result = await this.executeCommand(`test -f ${path} && echo "exists" || echo "not_found"`);
    return result.stdout.trim() === 'exists';
  }

  /**
   * 读取文件内容
   */
  async readFile(path: string): Promise<string> {
    const result = await this.executeCommand(`cat ${path}`);
    if (result.exitCode !== 0) {
      throw new CommandExecutionError(
        `无法读取文件: ${path}`,
        { path, stderr: result.stderr }
      );
    }
    return result.stdout;
  }
}

// ============== 便捷函数 ==============

/**
 * 创建 SSH 客户端并执行命令
 */
export async function executeSSHCommand(
  command: string,
  env?: Environment,
  options?: {
    validateSafety?: boolean;
    timeout?: number;
    maskOutput?: boolean;
  }
): Promise<SSHCommandResult> {
  const client = new SSHClient(env);
  try {
    await client.connect();
    return await client.executeCommand(command, options);
  } finally {
    client.disconnect();
  }
}
