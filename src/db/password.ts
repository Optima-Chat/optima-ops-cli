import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Environment } from '../utils/config.js';
import { ConfigurationError } from '../utils/error.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '../..');
const credentialsPath = join(projectRoot, '.db-credentials.json');

interface DatabaseCredential {
  user: string;
  password: string;
  database?: string;
  note?: string;
}

interface CredentialsFile {
  production: Record<string, DatabaseCredential>;
  stage: Record<string, DatabaseCredential>;
  rds: {
    host: string;
    port: number;
  };
}

let cachedCredentials: CredentialsFile | null = null;

/**
 * 加载数据库凭证配置文件
 */
function loadCredentials(): CredentialsFile {
  if (cachedCredentials) {
    return cachedCredentials;
  }

  if (!existsSync(credentialsPath)) {
    throw new ConfigurationError(
      '数据库凭证文件不存在。请运行: optima-ops db init-credentials',
      { path: credentialsPath }
    );
  }

  try {
    const content = readFileSync(credentialsPath, 'utf-8');
    cachedCredentials = JSON.parse(content);
    return cachedCredentials!;
  } catch (error: any) {
    throw new ConfigurationError(
      `读取数据库凭证文件失败: ${error.message}`,
      { path: credentialsPath }
    );
  }
}

/**
 * Get database password from local credentials file
 */
export async function getDatabasePassword(
  env: Environment,
  database: string
): Promise<string> {
  // 1. 尝试环境变量（优先级最高，用于临时覆盖）
  const envVar = `OPTIMA_DB_PASSWORD_${database.toUpperCase().replace(/-/g, '_')}`;
  if (process.env[envVar]) {
    return process.env[envVar];
  }

  // 2. 从本地配置文件读取
  try {
    const credentials = loadCredentials();
    const envKey = env === 'production' ? 'production' : 'stage';
    const dbCred = credentials[envKey][database];

    if (!dbCred || !dbCred.password) {
      throw new Error(`数据库 ${database} 的凭证不存在`);
    }

    return dbCred.password;
  } catch (error: any) {
    throw new ConfigurationError(
      `获取数据库密码失败: ${error.message}`,
      { database, env }
    );
  }
}

/**
 * Get database user from local credentials file
 */
export function getDatabaseUser(database: string, env: Environment): string {
  try {
    const credentials = loadCredentials();
    const envKey = env === 'production' ? 'production' : 'stage';
    const dbCred = credentials[envKey][database];

    if (!dbCred || !dbCred.user) {
      // Fallback to default user mapping
      return getDefaultDatabaseUser(database);
    }

    return dbCred.user;
  } catch (error) {
    return getDefaultDatabaseUser(database);
  }
}

/**
 * Get RDS connection info
 *
 * Note: RDS is in a private subnet. You must establish an SSH tunnel first:
 *   ssh -i ~/.ssh/optima-ec2-key -L 5432:10.0.10.221:5432 ec2-user@ec2-prod.optima.shop -N
 *
 * Then the CLI will connect to localhost:5432 which tunnels to the private RDS.
 */
export function getRDSInfo(): { host: string; port: number } {
  // Check if SSH tunnel environment variable is set
  const useTunnel = process.env.OPTIMA_USE_SSH_TUNNEL === 'true' || process.env.OPTIMA_USE_SSH_TUNNEL === '1';

  if (useTunnel) {
    // Connect through SSH tunnel on localhost
    return {
      host: '127.0.0.1',
      port: parseInt(process.env.OPTIMA_SSH_TUNNEL_PORT || '5432'),
    };
  }

  // Try to load from credentials file (direct connection, not recommended for private RDS)
  try {
    const credentials = loadCredentials();
    return credentials.rds;
  } catch (error) {
    // Fallback to localhost (assume SSH tunnel)
    return {
      host: '127.0.0.1',
      port: 5432,
    };
  }
}

/**
 * Fallback user mapping (legacy)
 */
function getDefaultDatabaseUser(database: string): string {
  const userMap: Record<string, string> = {
    optima_auth: 'auth_user',
    optima_mcp: 'mcp_user',
    optima_commerce: 'commerce_user',
    optima_chat: 'chat_user',
    optima_stage_auth: 'auth_stage_user',
    optima_stage_mcp: 'mcp_stage_user',
    optima_stage_commerce: 'commerce_stage_user',
    optima_stage_chat: 'chat_stage_user',
    optima_infisical: 'infisical_user',
    postgres: 'optima_admin',
  };

  return userMap[database] || 'optima_admin';
}
