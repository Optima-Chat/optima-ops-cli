import Conf from 'conf';

interface AdminCredentials {
  email: string;
  password: string;
}

interface AuthConfigSchema {
  adminCredentials: {
    'ecs-prod': AdminCredentials;
    'ecs-stage': AdminCredentials;
    'ec2-prod': AdminCredentials;
  };
  // Token 缓存（登录后保存）
  tokens: {
    [env: string]: {
      accessToken: string;
      expiresAt: number;
    };
  };
}

const DEFAULT_CREDENTIALS = {
  'ecs-prod': {
    email: 'admin@example.com',
    password: 'admin123',
  },
  'ecs-stage': {
    email: 'admin@example.com',
    password: 'hTqMKaVy3Xqo',
  },
  'ec2-prod': {
    email: 'admin@example.com',
    password: 'admin123',
  },
};

const authConfig = new Conf<AuthConfigSchema>({
  projectName: 'optima-ops-cli',
  configName: 'auth',
  defaults: {
    adminCredentials: DEFAULT_CREDENTIALS,
    tokens: {},
  },
});

// 确保配置文件存在且包含最新的默认凭证
// 如果配置文件中的凭证与代码中的默认值不同，则更新
function ensureCredentialsInitialized(): void {
  const envs = ['ecs-prod', 'ecs-stage', 'ec2-prod'] as const;
  for (const env of envs) {
    const current = authConfig.get(`adminCredentials.${env}`) as AdminCredentials | undefined;
    const defaultCreds = DEFAULT_CREDENTIALS[env];
    // 如果配置不存在，或者邮箱为空，则写入默认值
    if (!current || !current.email) {
      authConfig.set(`adminCredentials.${env}`, defaultCreds);
    }
  }
}

// 初始化时确保凭证存在
ensureCredentialsInitialized();

/**
 * 获取 admin 凭证
 */
export function getAdminCredentials(env: 'ecs-prod' | 'ecs-stage' | 'ec2-prod'): AdminCredentials {
  return authConfig.get(`adminCredentials.${env}`);
}

/**
 * 设置 admin 凭证
 */
export function setAdminCredentials(
  env: 'ecs-prod' | 'ecs-stage' | 'ec2-prod',
  credentials: AdminCredentials
): void {
  authConfig.set(`adminCredentials.${env}`, credentials);
}

interface TokenData {
  accessToken: string;
  expiresAt: number;
}

/**
 * 获取缓存的 token
 */
export function getCachedToken(env: string): string | null {
  const tokenData = authConfig.get(`tokens.${env}`) as TokenData | undefined;
  if (!tokenData) return null;

  // 检查是否过期（预留 5 分钟缓冲）
  if (Date.now() > tokenData.expiresAt - 5 * 60 * 1000) {
    return null;
  }

  return tokenData.accessToken;
}

/**
 * 缓存 token
 */
export function cacheToken(env: string, accessToken: string, expiresInSeconds: number): void {
  authConfig.set(`tokens.${env}`, {
    accessToken,
    expiresAt: Date.now() + expiresInSeconds * 1000,
  });
}

/**
 * 清除 token 缓存
 */
export function clearTokenCache(env?: string): void {
  if (env) {
    authConfig.delete(`tokens.${env}` as any);
  } else {
    authConfig.set('tokens', {});
  }
}

/**
 * 获取配置文件路径
 */
export function getAuthConfigPath(): string {
  return authConfig.path;
}
