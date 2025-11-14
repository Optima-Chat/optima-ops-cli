/**
 * 输出工具测试
 */

import { jest } from '@jest/globals';
import {
  isJsonOutput,
  outputSuccess,
  outputError,
  maskSensitive,
} from '../../utils/output.js';

describe('utils/output', () => {
  const originalEnv = process.env.OPTIMA_OUTPUT;
  let consoleLogSpy: any;
  let consoleErrorSpy: any;

  beforeEach(() => {
    // Mock console.log and console.error to capture output
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    // Restore original environment and console
    if (originalEnv) {
      process.env.OPTIMA_OUTPUT = originalEnv;
    } else {
      delete process.env.OPTIMA_OUTPUT;
    }
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe('isJsonOutput', () => {
    it('should return true when OPTIMA_OUTPUT is json', () => {
      process.env.OPTIMA_OUTPUT = 'json';
      expect(isJsonOutput()).toBe(true);
    });

    it('should return false when OPTIMA_OUTPUT is not json', () => {
      process.env.OPTIMA_OUTPUT = 'text';
      expect(isJsonOutput()).toBe(false);
    });

    it('should return false when OPTIMA_OUTPUT is not set', () => {
      delete process.env.OPTIMA_OUTPUT;
      expect(isJsonOutput()).toBe(false);
    });
  });

  describe('outputSuccess', () => {
    it('should output JSON with success flag', () => {
      const data = { test: 'value' };
      outputSuccess(data);

      expect(console.log).toHaveBeenCalledWith(
        JSON.stringify(
          {
            success: true,
            data,
          },
          null,
          2
        )
      );
    });

    it('should handle complex nested objects', () => {
      const data = {
        users: [{ id: 1, name: 'Test' }],
        meta: { count: 1 },
      };

      outputSuccess(data);

      expect(consoleLogSpy).toHaveBeenCalled();
      const output = consoleLogSpy.mock.calls[0][0];
      expect(output).toContain('"success": true');
      expect(output).toContain('"users"');
      expect(output).toContain('"meta"');
    });

    it('should handle arrays', () => {
      const data = [1, 2, 3];
      outputSuccess(data);

      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('should handle null and undefined', () => {
      outputSuccess(null);
      outputSuccess(undefined);

      expect(consoleLogSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe('outputError', () => {
    it('should output JSON error with success: false', () => {
      const error = new Error('Test error');
      outputError(error);

      expect(consoleErrorSpy).toHaveBeenCalled();
      const output = consoleErrorSpy.mock.calls[0][0];
      expect(output).toContain('"success": false');
      expect(output).toContain('Test error');
    });

    it('should include error code if available', () => {
      const error: any = new Error('Test error');
      error.code = 'ERR_TEST';
      outputError(error);

      expect(consoleErrorSpy).toHaveBeenCalled();
      const output = consoleErrorSpy.mock.calls[0][0];
      expect(output).toContain('ERR_TEST');
    });

    it('should handle string errors', () => {
      outputError('Simple error message');

      expect(consoleErrorSpy).toHaveBeenCalled();
      const output = consoleErrorSpy.mock.calls[0][0];
      expect(output).toContain('Simple error message');
    });
  });

  describe('maskSensitive', () => {
    it('should mask password in text', () => {
      const text = 'password=secret123';
      expect(maskSensitive(text)).toBe('password=***');
    });

    it('should mask multiple sensitive values', () => {
      const text = 'password=secret token=abc123 user=admin';
      const masked = maskSensitive(text);
      expect(masked).toContain('password=***');
      expect(masked).toContain('token=***');
      expect(masked).toContain('user=admin'); // not sensitive
    });

    it('should mask connection strings', () => {
      const text = 'postgresql://user:password@localhost:5432/db';
      const masked = maskSensitive(text);
      expect(masked).toContain('***');
      expect(masked).not.toContain('password');
    });

    it('should mask AWS keys', () => {
      const text = 'AKIAIOSFODNN7EXAMPLE';
      const masked = maskSensitive(text);
      expect(masked).toContain('***');
      expect(masked).not.toBe(text);
    });

    it('should handle empty string', () => {
      expect(maskSensitive('')).toBe('');
    });

    it('should handle strings without sensitive data', () => {
      const text = 'This is a normal text without secrets';
      expect(maskSensitive(text)).toBe(text);
    });

    it('should mask case-insensitive', () => {
      expect(maskSensitive('PASSWORD=secret')).toContain('***');
      expect(maskSensitive('Password=secret')).toContain('***');
      expect(maskSensitive('password=secret')).toContain('***');
    });
  });

  describe('Output formatting consistency', () => {
    it('should produce valid JSON for success', () => {
      const data = { key: 'value' };
      outputSuccess(data);

      const output = consoleLogSpy.mock.calls[0][0];
      expect(() => JSON.parse(output)).not.toThrow();

      const parsed = JSON.parse(output);
      expect(parsed.success).toBe(true);
      expect(parsed.data).toEqual(data);
    });

    it('should produce valid JSON for errors', () => {
      const error = new Error('Test error');
      outputError(error);

      const output = consoleErrorSpy.mock.calls[0][0];
      expect(() => JSON.parse(output)).not.toThrow();

      const parsed = JSON.parse(output);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toBeDefined();
    });
  });
});
