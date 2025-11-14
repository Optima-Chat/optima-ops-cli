/**
 * 数据脱敏工具测试
 */

import {
  isSensitiveKey,
  maskFully,
  maskPartial,
  maskDatabaseUrl,
  maskAwsKey,
  maskJwt,
  maskUrlParams,
  maskValue,
  maskObject,
  isMasked,
} from '../../utils/mask.js';

describe('utils/mask', () => {
  describe('isSensitiveKey', () => {
    it('should identify sensitive keys', () => {
      expect(isSensitiveKey('password')).toBe(true);
      expect(isSensitiveKey('PASSWORD')).toBe(true);
      expect(isSensitiveKey('db_password')).toBe(true);
      expect(isSensitiveKey('secret_key')).toBe(true);
      expect(isSensitiveKey('api_token')).toBe(true);
      expect(isSensitiveKey('access_key')).toBe(true);
    });

    it('should not identify non-sensitive keys', () => {
      expect(isSensitiveKey('username')).toBe(false);
      expect(isSensitiveKey('database_url')).toBe(false);
      expect(isSensitiveKey('port')).toBe(false);
      expect(isSensitiveKey('host')).toBe(false);
    });
  });

  describe('maskFully', () => {
    it('should fully mask any value', () => {
      expect(maskFully('secret')).toBe('***');
      expect(maskFully('very_long_secret_value')).toBe('***');
      expect(maskFully('')).toBe('***');
    });
  });

  describe('maskPartial', () => {
    it('should show first 3 and last 3 characters', () => {
      expect(maskPartial('1234567890')).toBe('123***890');
      expect(maskPartial('abcdefghij')).toBe('abc***hij');
    });

    it('should fully mask short values', () => {
      expect(maskPartial('abc')).toBe('***');
      expect(maskPartial('12345')).toBe('***');
      expect(maskPartial('123456')).toBe('***');
    });
  });

  describe('maskDatabaseUrl', () => {
    it('should mask PostgreSQL connection string', () => {
      const url = 'postgresql://user:password@host:5432/db';
      expect(maskDatabaseUrl(url)).toBe('postgresql://***:***@host:5432/db');
    });

    it('should mask postgres:// connection string', () => {
      const url = 'postgres://admin:secret123@localhost:5432/mydb';
      expect(maskDatabaseUrl(url)).toBe('postgres://***:***@localhost:5432/mydb');
    });

    it('should mask MySQL connection string', () => {
      const url = 'mysql://root:pass@localhost:3306/testdb';
      expect(maskDatabaseUrl(url)).toBe('mysql://***:***@localhost:3306/testdb');
    });

    it('should mask MongoDB connection string', () => {
      const url = 'mongodb://user:pass@host:27017/db';
      expect(maskDatabaseUrl(url)).toBe('mongodb://***:***@host:27017/db');
    });

    it('should mask MongoDB SRV connection string', () => {
      const url = 'mongodb+srv://user:pass@cluster.mongodb.net/db';
      expect(maskDatabaseUrl(url)).toBe('mongodb+srv://***:***@cluster.mongodb.net/db');
    });

    it('should return unchanged if not a database URL', () => {
      expect(maskDatabaseUrl('not_a_url')).toBe('not_a_url');
    });
  });

  describe('maskAwsKey', () => {
    it('should mask AWS Access Key ID', () => {
      const key = 'AKIAIOSFODNN7EXAMPLE';
      const masked = maskAwsKey(key);
      expect(masked).toBe('AKIA***MPLE');
      expect(masked).toMatch(/^AKIA\*\*\*\w{4}$/);
    });

    it('should mask AWS Secret Access Key', () => {
      const secret = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';
      const masked = maskAwsKey(secret);
      expect(masked).toContain('***');
      expect(masked.length).toBeLessThan(secret.length);
    });

    it('should return unchanged if not an AWS key', () => {
      expect(maskAwsKey('not_aws_key')).toBe('not_aws_key');
      expect(maskAwsKey('AKIA123')).toBe('AKIA123'); // too short
    });
  });

  describe('maskJwt', () => {
    it('should mask JWT token', () => {
      const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';
      const masked = maskJwt(jwt);
      expect(masked).toContain('***');
      expect(masked.startsWith('eyJhbG')).toBe(true);
      expect(masked.endsWith('THsR8U')).toBe(true);
    });

    it('should return unchanged if not a JWT', () => {
      expect(maskJwt('not_a_jwt')).toBe('not_a_jwt');
      expect(maskJwt('eyJ.invalid')).toBe('eyJ.invalid');
    });
  });

  describe('maskUrlParams', () => {
    it('should mask sensitive query parameters', () => {
      const url = 'https://api.example.com?api_key=secret123&user=admin';
      const masked = maskUrlParams(url);
      expect(masked).toContain('api_key=***');
      expect(masked).toContain('user=admin');
    });

    it('should mask password parameters', () => {
      const url = 'https://api.example.com?username=user&password=pass123';
      const masked = maskUrlParams(url);
      expect(masked).toContain('password=***');
      expect(masked).toContain('username=user');
    });

    it('should return unchanged if not a valid URL', () => {
      expect(maskUrlParams('not_a_url')).toBe('not_a_url');
    });
  });

  describe('maskValue', () => {
    it('should mask database URL based on key name', () => {
      const value = 'postgresql://user:pass@host:5432/db';
      expect(maskValue('DATABASE_URL', value)).toBe('postgresql://***:***@host:5432/db');
      expect(maskValue('DB_URL', value)).toBe('postgresql://***:***@host:5432/db');
    });

    it('should mask AWS keys based on key name', () => {
      const value = 'AKIAIOSFODNN7EXAMPLE';
      expect(maskValue('AWS_ACCESS_KEY_ID', value)).toContain('***');
      expect(maskValue('AWS_SECRET_ACCESS_KEY', 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY')).toContain('***');
    });

    it('should mask JWT based on key name and value format', () => {
      const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';
      expect(maskValue('ACCESS_TOKEN', jwt)).toContain('***');
      expect(maskValue('JWT_TOKEN', jwt)).toContain('***');
    });

    it('should mask URL with sensitive params', () => {
      const url = 'https://api.com?api_key=secret';
      expect(maskValue('API_ENDPOINT', url)).toContain('api_key=***');
    });

    it('should fully mask sensitive keys', () => {
      expect(maskValue('password', 'secret123')).toBe('***');
      expect(maskValue('secret_key', 'mysecret')).toBe('***');
      expect(maskValue('api_token', 'token123')).toBe('***');
    });

    it('should return unchanged for non-sensitive keys', () => {
      expect(maskValue('username', 'admin')).toBe('admin');
      expect(maskValue('port', '5432')).toBe('5432');
      expect(maskValue('host', 'localhost')).toBe('localhost');
    });
  });

  describe('maskObject', () => {
    it('should mask all sensitive values in an object', () => {
      const obj = {
        username: 'admin',
        password: 'secret123',
        database_url: 'postgresql://user:pass@host:5432/db',
        port: '5432',
      };

      const masked = maskObject(obj);

      expect(masked.username).toBe('admin');
      expect(masked.password).toBe('***');
      expect(masked.database_url).toBe('postgresql://***:***@host:5432/db');
      expect(masked.port).toBe('5432');
    });

    it('should handle nested objects', () => {
      const obj = {
        config: {
          username: 'admin',
          password: 'secret',
        },
      };

      const masked = maskObject(obj);

      expect(masked.config.username).toBe('admin');
      expect(masked.config.password).toBe('***');
    });

    it('should preserve non-string values', () => {
      const obj = {
        port: 5432,
        enabled: true,
        tags: ['tag1', 'tag2'],
      };

      const masked = maskObject(obj);

      expect(masked.port).toBe(5432);
      expect(masked.enabled).toBe(true);
      expect(masked.tags).toEqual(['tag1', 'tag2']);
    });
  });

  describe('isMasked', () => {
    it('should detect masked values', () => {
      expect(isMasked('***')).toBe(true);
      expect(isMasked('abc***xyz')).toBe(true);
      expect(isMasked('postgresql://***:***@host')).toBe(true);
    });

    it('should not detect unmasked values', () => {
      expect(isMasked('normal_value')).toBe(false);
      expect(isMasked('password123')).toBe(false);
      expect(isMasked('')).toBe(false);
    });
  });
});
