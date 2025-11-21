import type { ConfigLoadResult } from './config-loader.js';

/**
 * Infisical 配置信息（从 Terraform locals.tf 或 config-spec.yaml 获取）
 */
export interface InfisicalConfig {
  projectId: string;      // Infisical Project ID
  environment: string;    // staging, prod
  path: string;           // /services/user-auth
  siteUrl?: string;       // Infisical 实例地址，默认 https://secrets.optima.onl
}

/**
 * 服务到 Infisical 配置的映射
 */
const SERVICE_INFISICAL_CONFIG: Record<string, InfisicalConfig> = {
  'user-auth': {
    projectId: 'f2415dc2-f79d-4e41-90bb-cd3d2631ec71',
    environment: 'staging',
    path: '/services/user-auth',
  },
  'user-auth-admin': {
    projectId: 'f2415dc2-f79d-4e41-90bb-cd3d2631ec71',
    environment: 'staging',
    path: '/services/user-auth-admin',
  },
  'commerce-backend': {
    projectId: 'f2415dc2-f79d-4e41-90bb-cd3d2631ec71',
    environment: 'staging',
    path: '/services/commerce-backend',
  },
  'mcp-host': {
    projectId: 'f2415dc2-f79d-4e41-90bb-cd3d2631ec71',
    environment: 'staging',
    path: '/services/mcp-host',
  },
  'agentic-chat': {
    projectId: 'f2415dc2-f79d-4e41-90bb-cd3d2631ec71',
    environment: 'staging',
    path: '/services/agentic-chat',
  },
};

/**
 * Infisical API Secret 响应格式
 */
interface InfisicalSecret {
  secretKey: string;
  secretValue: string;
  type: string;
  version: number;
}

/**
 * Infisical 配置加载器
 * 通过 Infisical HTTP API 获取密钥配置
 */
export class InfisicalConfigLoader {
  private readonly infisicalConfig: InfisicalConfig;
  private readonly siteUrl: string;
  private accessToken: string | null = null;
  protected readonly service: string;
  protected readonly environment: string;

  constructor(
    service: string,
    environment: string,
    private readonly clientId?: string,
    private readonly clientSecret?: string
  ) {
    this.service = service;
    this.environment = environment;

    // 获取服务的 Infisical 配置
    const config = SERVICE_INFISICAL_CONFIG[service];
    if (!config) {
      throw new Error(`未找到服务 ${service} 的 Infisical 配置`);
    }

    // 根据环境调整 environment
    this.infisicalConfig = {
      ...config,
      environment: environment === 'production' ? 'prod' : 'staging',
    };

    this.siteUrl = config.siteUrl || 'https://secrets.optima.onl';
  }

  /**
   * 使用 Machine Identity 获取访问令牌
   */
  private async authenticate(): Promise<string> {
    if (this.accessToken) {
      return this.accessToken;
    }

    // 优先使用传入的凭证，其次使用环境变量
    const clientId = this.clientId || process.env.INFISICAL_CLIENT_ID;
    const clientSecret = this.clientSecret || process.env.INFISICAL_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error(
        '缺少 Infisical 认证凭证。请设置 INFISICAL_CLIENT_ID 和 INFISICAL_CLIENT_SECRET 环境变量，' +
        '或在调用时传入 clientId 和 clientSecret 参数。'
      );
    }

    try {
      const response = await fetch(`${this.siteUrl}/api/v1/auth/universal-auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          clientId,
          clientSecret,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Infisical 认证失败 (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      this.accessToken = data.accessToken;
      return this.accessToken!;
    } catch (error: any) {
      if (error.message.includes('Infisical')) {
        throw error;
      }
      throw new Error(`Infisical 认证请求失败: ${error.message}`);
    }
  }

  /**
   * 获取指定路径下的所有密钥
   */
  private async fetchSecrets(): Promise<InfisicalSecret[]> {
    const token = await this.authenticate();

    const url = new URL(`${this.siteUrl}/api/v3/secrets/raw`);
    url.searchParams.set('workspaceId', this.infisicalConfig.projectId);
    url.searchParams.set('environment', this.infisicalConfig.environment);
    url.searchParams.set('secretPath', this.infisicalConfig.path);
    url.searchParams.set('expandSecretReferences', 'true'); // 自动解析 ${} 引用

    try {
      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`获取 Infisical 密钥失败 (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      return data.secrets || [];
    } catch (error: any) {
      if (error.message.includes('Infisical')) {
        throw error;
      }
      throw new Error(`Infisical API 请求失败: ${error.message}`);
    }
  }

  async load(): Promise<ConfigLoadResult> {
    const result: ConfigLoadResult = {
      source: 'infisical',
      service: this.service,
      environment: this.environment,
      config: {},
      loadedAt: new Date(),
      errors: [],
    };

    try {
      const secrets = await this.fetchSecrets();

      if (secrets.length === 0) {
        result.errors?.push(
          `未找到配置: Project=${this.infisicalConfig.projectId}, ` +
          `Env=${this.infisicalConfig.environment}, Path=${this.infisicalConfig.path}`
        );
        return result;
      }

      // 解析密钥
      for (const secret of secrets) {
        // secretKey 已经是大写下划线格式（Infisical 标准）
        result.config[secret.secretKey] = secret.secretValue;
      }

      return result;
    } catch (error: any) {
      result.errors?.push(`加载 Infisical 配置失败: ${error.message}`);
      return result;
    }
  }
}

/**
 * 获取服务的 Infisical 配置
 */
export function getServiceInfisicalConfig(service: string): InfisicalConfig | undefined {
  return SERVICE_INFISICAL_CONFIG[service];
}

/**
 * 检查服务是否支持 Infisical
 */
export function isInfisicalSupported(service: string): boolean {
  return service in SERVICE_INFISICAL_CONFIG;
}
