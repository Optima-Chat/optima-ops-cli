/**
 * 数据脱敏工具
 * 自动识别敏感信息并进行脱敏处理
 */

/**
 * 敏感参数名称模式（不区分大小写）
 */
const SENSITIVE_KEYS = [
  'password',
  'passwd',
  'secret',
  'token',
  'api_key',
  'apikey',
  'access_key',
  'private_key',
  'credential',
  'auth',
];

/**
 * 检查 key 是否包含敏感词
 */
export function isSensitiveKey(key: string): boolean {
  const lowerKey = key.toLowerCase();
  return SENSITIVE_KEYS.some(sensitive => lowerKey.includes(sensitive));
}

/**
 * 完全隐藏值（显示为 ***）
 */
export function maskFully(_value: string): string {
  return '***';
}

/**
 * 部分隐藏（显示前3后3字符）
 */
export function maskPartial(_value: string): string {
  if (_value.length <= 6) {
    return '***';
  }
  const start = _value.substring(0, 3);
  const end = _value.substring(_value.length - 3);
  return `${start}***${end}`;
}

/**
 * 脱敏数据库连接字符串
 * postgresql://user:password@host:port/db → postgresql://***:***@host:port/db
 */
export function maskDatabaseUrl(value: string): string {
  // PostgreSQL
  if (value.match(/^postgres(ql)?:\/\//)) {
    return value.replace(
      /^(postgres(?:ql)?:\/\/)([^:]+):([^@]+)@/,
      '$1***:***@'
    );
  }

  // MySQL
  if (value.match(/^mysql:\/\//)) {
    return value.replace(
      /^(mysql:\/\/)([^:]+):([^@]+)@/,
      '$1***:***@'
    );
  }

  // MongoDB
  if (value.match(/^mongodb(\+srv)?:\/\//)) {
    return value.replace(
      /^(mongodb(?:\+srv)?:\/\/)([^:]+):([^@]+)@/,
      '$1***:***@'
    );
  }

  return value;
}

/**
 * 脱敏 AWS 密钥
 * AKIAIOSFODNN7EXAMPLE → AKIA***MPLE
 */
export function maskAwsKey(value: string): string {
  // AWS Access Key ID (AKIA...)
  if (value.match(/^AKIA[0-9A-Z]{16}$/)) {
    return `${value.substring(0, 4)}***${value.substring(value.length - 4)}`;
  }

  // AWS Secret Access Key (40 characters)
  if (value.length === 40 && value.match(/^[A-Za-z0-9/+=]+$/)) {
    return `${value.substring(0, 4)}***${value.substring(value.length - 4)}`;
  }

  return value;
}

/**
 * 脱敏 JWT Token
 * eyJhbGc... → eyJ***xyz
 */
export function maskJwt(value: string): string {
  if (value.startsWith('eyJ') && value.includes('.')) {
    const parts = value.split('.');
    if (parts.length === 3 && parts[0] && parts[2]) {
      const lastPart = parts[2];
      return `${parts[0].substring(0, 6)}***${lastPart.substring(lastPart.length - 6)}`;
    }
  }
  return value;
}

/**
 * 脱敏 URL 中的参数
 * https://api.com?key=secret → https://api.com?key=***
 */
export function maskUrlParams(value: string): string {
  try {
    const url = new URL(value);
    const maskedParams = new URLSearchParams();

    url.searchParams.forEach((val, key) => {
      if (isSensitiveKey(key)) {
        maskedParams.set(key, '***');
      } else {
        maskedParams.set(key, val);
      }
    });

    url.search = maskedParams.toString();
    return url.toString();
  } catch (error) {
    // 不是有效的 URL，返回原值
    return value;
  }
}

/**
 * 智能脱敏
 * 根据 key 名称和 value 内容自动选择合适的脱敏方式
 */
export function maskValue(key: string, value: string): string {
  if (!value || typeof value !== 'string') {
    return value;
  }

  // 数据库连接字符串
  if (key.toLowerCase().includes('database_url') || key.toLowerCase().includes('db_url')) {
    return maskDatabaseUrl(value);
  }

  // AWS 密钥
  if (key.toLowerCase().includes('aws') && (key.toLowerCase().includes('key') || key.toLowerCase().includes('secret'))) {
    return maskAwsKey(value);
  }

  // JWT Token
  if (key.toLowerCase().includes('token') && value.startsWith('eyJ')) {
    return maskJwt(value);
  }

  // URL 参数
  if (value.startsWith('http://') || value.startsWith('https://')) {
    return maskUrlParams(value);
  }

  // 敏感 key - 完全隐藏
  if (isSensitiveKey(key)) {
    return maskFully(value);
  }

  // 默认返回原值
  return value;
}

/**
 * 批量脱敏对象的所有值
 */
export function maskObject(obj: Record<string, any>): Record<string, any> {
  const masked: Record<string, any> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      masked[key] = maskValue(key, value);
    } else if (typeof value === 'object' && value !== null) {
      masked[key] = maskObject(value);
    } else {
      masked[key] = value;
    }
  }

  return masked;
}

/**
 * 检测值是否已脱敏
 */
export function isMasked(value: string): boolean {
  return value === '***' || value.includes('***');
}
