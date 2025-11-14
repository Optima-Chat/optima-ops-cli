/**
 * 错误处理测试
 */

import {
  OpsCLIError,
  SSHConnectionError,
  CommandExecutionError,
  AWSError,
  ConfigurationError,
  ValidationError,
  DatabaseError,
} from '../../utils/error.js';

describe('utils/error', () => {
  describe('OpsCLIError', () => {
    it('should create base error with message', () => {
      const error = new OpsCLIError('Test error');
      expect(error.message).toBe('Test error');
      expect(error.name).toBe('OpsCLIError');
      expect(error.code).toBe('OPS_CLI_ERROR');
      expect(error).toBeInstanceOf(Error);
    });

    it('should include details', () => {
      const error = new OpsCLIError('Test error', 'TEST_CODE', { key: 'value' });
      expect(error.details).toEqual({ key: 'value' });
      expect(error.code).toBe('TEST_CODE');
    });

    it('should work without details', () => {
      const error = new OpsCLIError('Test error');
      expect(error.details).toBeUndefined();
    });
  });

  describe('SSHConnectionError', () => {
    it('should create SSH connection error', () => {
      const error = new SSHConnectionError('Connection failed', {
        host: 'ec2-prod.optima.shop',
        port: 22,
      });

      expect(error.message).toBe('Connection failed');
      expect(error.name).toBe('SSHConnectionError');
      expect(error.details?.host).toBe('ec2-prod.optima.shop');
      expect(error.details?.port).toBe(22);
      expect(error).toBeInstanceOf(OpsCLIError);
    });
  });

  describe('CommandExecutionError', () => {
    it('should create command execution error', () => {
      const error = new CommandExecutionError('Command failed', {
        command: 'docker ps',
        exitCode: 1,
        stderr: 'Error output',
      });

      expect(error.message).toBe('Command failed');
      expect(error.name).toBe('CommandExecutionError');
      expect(error.details?.command).toBe('docker ps');
      expect(error.details?.exitCode).toBe(1);
      expect(error).toBeInstanceOf(OpsCLIError);
    });
  });

  describe('AWSError', () => {
    it('should create AWS error', () => {
      const error = new AWSError('AWS operation failed', {
        service: 'SSM',
        operation: 'GetParameter',
        errorCode: 'ParameterNotFound',
      });

      expect(error.message).toBe('AWS operation failed');
      expect(error.name).toBe('AWSError');
      expect(error.details?.service).toBe('SSM');
      expect(error.details?.operation).toBe('GetParameter');
      expect(error).toBeInstanceOf(OpsCLIError);
    });
  });

  describe('ConfigurationError', () => {
    it('should create configuration error', () => {
      const error = new ConfigurationError('Invalid configuration', {
        configKey: 'database_url',
        expectedType: 'string',
      });

      expect(error.message).toBe('Invalid configuration');
      expect(error.name).toBe('ConfigurationError');
      expect(error.details?.configKey).toBe('database_url');
      expect(error).toBeInstanceOf(OpsCLIError);
    });
  });

  describe('ValidationError', () => {
    it('should create validation error', () => {
      const error = new ValidationError('Validation failed', {
        field: 'email',
        value: 'invalid',
        rule: 'email format',
      });

      expect(error.message).toBe('Validation failed');
      expect(error.name).toBe('ValidationError');
      expect(error.details?.field).toBe('email');
      expect(error).toBeInstanceOf(OpsCLIError);
    });
  });

  describe('DatabaseError', () => {
    it('should create database error', () => {
      const error = new DatabaseError('Query failed', {
        query: 'SELECT * FROM users',
        database: 'optima_auth',
        errorCode: '42P01',
      });

      expect(error.message).toBe('Query failed');
      expect(error.name).toBe('DatabaseError');
      expect(error.details?.query).toBe('SELECT * FROM users');
      expect(error.details?.database).toBe('optima_auth');
      expect(error).toBeInstanceOf(OpsCLIError);
    });
  });

  describe('Error inheritance chain', () => {
    it('should maintain proper inheritance chain', () => {
      const sshError = new SSHConnectionError('Test');
      expect(sshError).toBeInstanceOf(SSHConnectionError);
      expect(sshError).toBeInstanceOf(OpsCLIError);
      expect(sshError).toBeInstanceOf(Error);
    });

    it('should have correct instanceof checks for all error types', () => {
      const errors = [
        new SSHConnectionError('test'),
        new CommandExecutionError('test'),
        new AWSError('test'),
        new ConfigurationError('test'),
        new ValidationError('test'),
        new DatabaseError('test'),
      ];

      errors.forEach(error => {
        expect(error).toBeInstanceOf(OpsCLIError);
        expect(error).toBeInstanceOf(Error);
      });
    });
  });

  describe('Stack trace', () => {
    it('should capture stack trace', () => {
      const error = new OpsCLIError('Test error');
      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('OpsCLIError');
    });

    it('should have different stack traces for different errors', () => {
      const error1 = new OpsCLIError('Error 1');
      const error2 = new OpsCLIError('Error 2');
      expect(error1.stack).not.toBe(error2.stack);
    });
  });
});
