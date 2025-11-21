import { getParameter, getParametersByPath } from '../utils/aws/ssm.js';
import { Environment } from '../utils/config.js';
import { InfisicalConfigLoader, isInfisicalSupported } from './infisical-loader.js';

// 重新导出 Infisical 相关
export { InfisicalConfigLoader, isInfisicalSupported } from './infisical-loader.js';

/**
 * 配置源类型
 */
export type ConfigSource = 'ssm' | 'github' | 'infisical' | 'container';

/**
 * 配置加载结果
 */
export interface ConfigLoadResult {
  source: ConfigSource;
  service: string;
  environment: string;
  config: Record<string, string>;
  loadedAt: Date;
  errors?: string[];
}

/**
 * 配置加载器基类
 */
export abstract class ConfigLoader {
  constructor(
    protected readonly service: string,
    protected readonly environment: string
  ) {}

  abstract load(): Promise<ConfigLoadResult>;
}

/**
 * AWS SSM Parameter Store 配置加载器
 */
export class SSMConfigLoader extends ConfigLoader {
  async load(): Promise<ConfigLoadResult> {
    const result: ConfigLoadResult = {
      source: 'ssm',
      service: this.service,
      environment: this.environment,
      config: {},
      loadedAt: new Date(),
      errors: [],
    };

    try {
      // 构建 SSM 路径
      // 格式: /optima/{env}/{service}/{parameter}
      const envPath = this.environment === 'production' ? 'prod' : this.environment;
      const basePath = `/optima/${envPath}/${this.service}/`;

      // 获取所有参数
      const parameters = await getParametersByPath(basePath);

      if (!parameters || parameters.length === 0) {
        result.errors?.push(`未找到配置参数: ${basePath}`);
        return result;
      }

      // 解析参数
      for (const param of parameters) {
        if (param.Name && param.Value) {
          // 提取参数名（移除路径前缀）
          const paramName = param.Name.replace(basePath, '');
          // 转换为大写下划线格式（SSM 使用 kebab-case，环境变量使用 UPPER_SNAKE_CASE）
          const envVarName = paramName.toUpperCase().replace(/-/g, '_');
          result.config[envVarName] = param.Value;
        }
      }

      return result;
    } catch (error: any) {
      result.errors?.push(`加载 SSM 配置失败: ${error.message}`);
      return result;
    }
  }
}

/**
 * 容器环境变量加载器（通过 SSH）
 */
export class ContainerConfigLoader extends ConfigLoader {
  constructor(
    service: string,
    environment: string,
    private readonly sshClient: any  // SSHClient 实例
  ) {
    super(service, environment);
  }

  async load(): Promise<ConfigLoadResult> {
    const result: ConfigLoadResult = {
      source: 'container',
      service: this.service,
      environment: this.environment,
      config: {},
      loadedAt: new Date(),
      errors: [],
    };

    try {
      // 获取容器名称
      const envSuffix = this.environment === 'production' ? 'prod' : this.environment;
      const containerName = `optima-${this.service}-${envSuffix}`;

      // 通过 docker exec 获取环境变量
      const envResult = await this.sshClient.executeCommand(
        `docker exec ${containerName} env`
      );

      if (envResult.exitCode !== 0) {
        result.errors?.push(`获取容器环境变量失败: ${envResult.stderr}`);
        return result;
      }

      // 解析环境变量
      const lines = envResult.stdout.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.includes('=')) continue;

        const [key, ...valueParts] = trimmed.split('=');
        const value = valueParts.join('=');

        // 过滤掉系统环境变量
        if (this.isSystemVariable(key)) continue;

        result.config[key] = value;
      }

      return result;
    } catch (error: any) {
      result.errors?.push(`加载容器配置失败: ${error.message}`);
      return result;
    }
  }

  /**
   * 判断是否是系统环境变量（应该忽略）
   */
  private isSystemVariable(key: string): boolean {
    const systemVars = [
      'PATH',
      'HOME',
      'HOSTNAME',
      'PWD',
      'SHLVL',
      'LANG',
      'GPG_KEY',
      'PYTHON_VERSION',
      'PYTHON_SHA256',
    ];

    return systemVars.includes(key);
  }
}

/**
 * GitHub Environment Variables 加载器
 * TODO: 实现通过 GitHub API 获取仓库的 environment variables
 */
export class GitHubConfigLoader extends ConfigLoader {
  async load(): Promise<ConfigLoadResult> {
    const result: ConfigLoadResult = {
      source: 'github',
      service: this.service,
      environment: this.environment,
      config: {},
      loadedAt: new Date(),
      errors: ['GitHub 配置加载器暂未实现'],
    };

    return result;
  }
}

/**
 * 配置加载器选项
 */
export interface ConfigLoaderOptions {
  sshClient?: any;
  infisicalClientId?: string;
  infisicalClientSecret?: string;
}

/**
 * 工厂函数：创建配置加载器
 */
export function createConfigLoader(
  source: ConfigSource,
  service: string,
  environment: string,
  options?: ConfigLoaderOptions
): ConfigLoader {
  switch (source) {
    case 'ssm':
      return new SSMConfigLoader(service, environment);
    case 'container':
      if (!options?.sshClient) {
        throw new Error('Container 加载器需要 SSH 客户端');
      }
      return new ContainerConfigLoader(service, environment, options.sshClient);
    case 'github':
      return new GitHubConfigLoader(service, environment);
    case 'infisical':
      return new InfisicalConfigLoader(
        service,
        environment,
        options?.infisicalClientId,
        options?.infisicalClientSecret
      );
    default:
      throw new Error(`不支持的配置源: ${source}`);
  }
}

/**
 * 根据环境自动选择配置源
 * - stage 环境使用 Infisical
 * - production 环境使用 SSM
 */
export function getDefaultConfigSource(environment: string): ConfigSource {
  return environment === 'stage' ? 'infisical' : 'ssm';
}
