import { getParameter } from '../utils/aws/ssm.js';
import { Environment } from '../utils/config.js';
import { ConfigurationError } from '../utils/error.js';

/**
 * Get database password from AWS Parameter Store or environment variables
 */
export async function getDatabasePassword(
  env: Environment,
  database: string
): Promise<string> {
  // Try environment variable first (for local development)
  const envVar = `OPTIMA_DB_PASSWORD_${database.toUpperCase()}`;
  if (process.env[envVar]) {
    return process.env[envVar];
  }

  // Get from AWS Parameter Store
  try {
    const dbUser = getDatabaseUser(database);
    const paramName = `/optima/${env}/database/${dbUser}/password`;

    const param = await getParameter(paramName);

    if (!param || !param.Value) {
      throw new ConfigurationError(
        `无法获取数据库密码: ${paramName}`,
        { database, env }
      );
    }

    return param.Value;
  } catch (error: any) {
    throw new ConfigurationError(
      `获取数据库密码失败: ${error.message}`,
      { database, env }
    );
  }
}

/**
 * Map database name to user
 */
function getDatabaseUser(database: string): string {
  const userMap: Record<string, string> = {
    optima_auth: 'auth_user',
    optima_mcp: 'mcp_user',
    optima_commerce: 'commerce_user',
    optima_chat: 'chat_user',
    optima_stage_auth: 'auth_user',
    optima_stage_mcp: 'mcp_user',
    optima_stage_commerce: 'commerce_user',
    optima_stage_chat: 'chat_user',
  };

  return userMap[database] || 'optima_admin';
}
