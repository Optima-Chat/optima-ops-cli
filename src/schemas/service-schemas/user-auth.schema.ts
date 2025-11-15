import { z } from 'zod';

/**
 * User Auth Service Configuration Schema
 * 定义所有必需和可选的环境变量
 */
export const userAuthSchema = z.object({
  // ========== 应用配置 ==========
  APP_NAME: z.string().default('user-auth'),
  APP_PORT: z.string().regex(/^\d+$/).default('8000'),
  NODE_ENV: z.enum(['development', 'production', 'staging']).default('production'),
  DEBUG: z.string().regex(/^(true|false)$/).default('false'),
  LOG_LEVEL: z.enum(['DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL']).default('INFO'),
  PROJECT_NAME: z.string().optional(),

  // ========== 数据库配置 ==========
  DATABASE_URL: z.string().url('必须是有效的数据库连接字符串'),

  // ========== Redis 配置 ==========
  REDIS_URL: z.string().url('必须是有效的 Redis 连接字符串'),

  // ========== JWT 配置 ==========
  JWT_SECRET_KEY: z.string().min(32, 'JWT 密钥至少 32 字符'),
  JWT_ALGORITHM: z.enum(['RS256', 'HS256']).default('RS256'),
  SECRET_KEY: z.string().min(32, '密钥至少 32 字符'),
  ALGORITHM: z.enum(['RS256', 'HS256']).default('RS256'),

  // ========== OAuth 配置 ==========
  OAUTH_ISSUER: z.string().url('必须是有效的 OAuth issuer URL'),
  OAUTH_PRIVATE_KEY_PATH: z.string().optional(),
  OAUTH_PUBLIC_KEY_PATH: z.string().optional(),

  // ========== Token 过期配置 ==========
  ACCESS_TOKEN_EXPIRE_MINUTES: z.string().regex(/^\d+$/).default('30'),
  REFRESH_TOKEN_EXPIRE_DAYS: z.string().regex(/^\d+$/).default('7'),

  // ========== Device Code 配置 ==========
  DEVICE_CODE_EXPIRES_IN: z.string().regex(/^\d+$/).default('600'),
  DEVICE_CODE_POLL_INTERVAL: z.string().regex(/^\d+$/).default('5'),
  DEVICE_CODE_CLEANUP_INTERVAL: z.string().regex(/^\d+$/).default('1800'),
  DEVICE_VERIFICATION_URI: z.string().url('必须是有效的验证 URI'),

  // ========== Email 配置 ==========
  RESEND_API_KEY: z.string().startsWith('re_', 'Resend API key 必须以 re_ 开头'),
  RESEND_FROM_EMAIL: z.string().email('必须是有效的邮箱地址'),
  RESEND_FROM_NAME: z.string().min(1, '发件人名称不能为空'),
  EMAIL_TEMPLATES_DIR: z.string().default('templates/emails'),

  // ========== Admin Panel 配置 ==========
  NEXT_PUBLIC_CLIENT_ID: z.string().min(1, 'Client ID 不能为空'),
  NEXT_PUBLIC_API_URL: z.string().url('必须是有效的 API URL'),

  // ========== CORS 配置 ==========
  BACKEND_CORS_ORIGINS: z.string().refine(
    (val) => {
      try {
        const parsed = JSON.parse(val);
        return Array.isArray(parsed);
      } catch {
        return false;
      }
    },
    { message: '必须是有效的 JSON 数组' }
  ),

  // ========== 客户端配置 ==========
  ADMIN_CLIENT_ID: z.string().min(1, 'Admin Client ID 不能为空'),
  DEFAULT_CLIENT_ID: z.string().min(1, 'Default Client ID 不能为空').optional(),
});

/**
 * 参数元数据
 */
export const userAuthMetadata = {
  serviceName: 'user-auth',
  displayName: 'User Authentication Service',

  /**
   * 必需参数列表
   */
  required: [
    'DATABASE_URL',
    'REDIS_URL',
    'JWT_SECRET_KEY',
    'SECRET_KEY',
    'OAUTH_ISSUER',
    'DEVICE_VERIFICATION_URI',
    'RESEND_API_KEY',
    'RESEND_FROM_EMAIL',
    'RESEND_FROM_NAME',
    'NEXT_PUBLIC_CLIENT_ID',
    'NEXT_PUBLIC_API_URL',
    'BACKEND_CORS_ORIGINS',
    'ADMIN_CLIENT_ID',
  ],

  /**
   * 参数描述
   */
  descriptions: {
    APP_NAME: '应用名称',
    APP_PORT: '应用端口',
    NODE_ENV: '运行环境',
    DEBUG: '调试模式',
    LOG_LEVEL: '日志级别',

    DATABASE_URL: '数据库连接字符串（PostgreSQL）',
    REDIS_URL: 'Redis 连接字符串',

    JWT_SECRET_KEY: 'JWT 签名密钥',
    JWT_ALGORITHM: 'JWT 签名算法',
    SECRET_KEY: '应用密钥',
    ALGORITHM: '加密算法',

    OAUTH_ISSUER: 'OAuth 发行者 URL',
    OAUTH_PRIVATE_KEY_PATH: 'OAuth 私钥路径',
    OAUTH_PUBLIC_KEY_PATH: 'OAuth 公钥路径',

    ACCESS_TOKEN_EXPIRE_MINUTES: 'Access Token 过期时间（分钟）',
    REFRESH_TOKEN_EXPIRE_DAYS: 'Refresh Token 过期时间（天）',

    DEVICE_CODE_EXPIRES_IN: 'Device Code 过期时间（秒）',
    DEVICE_CODE_POLL_INTERVAL: 'Device Code 轮询间隔（秒）',
    DEVICE_CODE_CLEANUP_INTERVAL: 'Device Code 清理间隔（秒）',
    DEVICE_VERIFICATION_URI: 'Device 验证页面 URL',

    RESEND_API_KEY: 'Resend 邮件服务 API Key',
    RESEND_FROM_EMAIL: '发件邮箱地址',
    RESEND_FROM_NAME: '发件人名称',
    EMAIL_TEMPLATES_DIR: '邮件模板目录',

    NEXT_PUBLIC_CLIENT_ID: 'Admin Panel OAuth Client ID',
    NEXT_PUBLIC_API_URL: 'Admin Panel API URL',

    BACKEND_CORS_ORIGINS: 'CORS 允许的源列表（JSON 数组）',

    ADMIN_CLIENT_ID: 'Admin OAuth Client ID',
    DEFAULT_CLIENT_ID: '默认 OAuth Client ID',
  },

  /**
   * 环境特定验证规则
   */
  environmentRules: {
    production: {
      // Prod 必须使用 .shop 域名
      OAUTH_ISSUER: (val: string) => val.includes('.shop'),
      DEVICE_VERIFICATION_URI: (val: string) => val.includes('.shop'),
      NEXT_PUBLIC_API_URL: (val: string) => val.includes('.shop'),

      // Prod 不应该是 debug 模式
      DEBUG: (val: string) => val === 'false',
      NODE_ENV: (val: string) => val === 'production',
    },
    stage: {
      // Stage 应该使用 -stage 标识
      DATABASE_URL: (val: string) => val.includes('stage'),
      REDIS_URL: (val: string) => val.includes('stage') || val.includes('0001'),
      NODE_ENV: (val: string) => val === 'production' || val === 'staging',
    },
  },

  /**
   * 敏感参数列表（需要脱敏）
   */
  sensitive: [
    'JWT_SECRET_KEY',
    'SECRET_KEY',
    'RESEND_API_KEY',
    'DATABASE_URL',
    'REDIS_URL',
  ],
};

/**
 * 类型定义
 */
export type UserAuthConfig = z.infer<typeof userAuthSchema>;
