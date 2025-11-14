/**
 * 配置工具测试
 */

import {
  getCurrentEnvironment,
  getCurrentEnvConfig,
  getAWSRegion,
  Environment,
} from '../../utils/config.js';

describe('utils/config', () => {
  const originalEnv = process.env.OPTIMA_OPS_ENV;

  afterEach(() => {
    // 恢复原始环境变量
    if (originalEnv) {
      process.env.OPTIMA_OPS_ENV = originalEnv;
    } else {
      delete process.env.OPTIMA_OPS_ENV;
    }
  });

  describe('getCurrentEnvironment', () => {
    it('should return environment from OPTIMA_OPS_ENV', () => {
      process.env.OPTIMA_OPS_ENV = 'production';
      expect(getCurrentEnvironment()).toBe('production');

      process.env.OPTIMA_OPS_ENV = 'stage';
      expect(getCurrentEnvironment()).toBe('stage');

      process.env.OPTIMA_OPS_ENV = 'development';
      expect(getCurrentEnvironment()).toBe('development');
    });

    it('should return production as default', () => {
      delete process.env.OPTIMA_OPS_ENV;
      // 默认值是 'production'（见 src/utils/config.ts 第 66 行）
      expect(getCurrentEnvironment()).toBe('production');
    });

    it('should handle invalid environment gracefully', () => {
      process.env.OPTIMA_OPS_ENV = 'invalid' as any;
      // 当环境变量无效时，回退到配置文件默认值 'production'
      const env = getCurrentEnvironment();
      expect(env).toBe('production');
    });
  });

  describe('getCurrentEnvConfig', () => {
    it('should return production config', () => {
      process.env.OPTIMA_OPS_ENV = 'production';
      const config = getCurrentEnvConfig();

      expect(config.ec2Host).toBe('ec2-prod.optima.shop');
      expect(config.rdsHost).toContain('optima-prod-postgres');
      expect(config.services).toContain('user-auth');
      expect(config.services).toContain('mcp-host');
      expect(config.services).toContain('commerce-backend');
      expect(config.services).toContain('agentic-chat');
    });

    it('should return stage config', () => {
      process.env.OPTIMA_OPS_ENV = 'stage';
      const config = getCurrentEnvConfig();

      expect(config.ec2Host).toBe('ec2-stage.optima.shop');
      expect(config.rdsHost).toContain('optima-stage-postgres');
    });

    it('should return development config', () => {
      process.env.OPTIMA_OPS_ENV = 'development';
      const config = getCurrentEnvConfig();

      expect(config.ec2Host).toBe('ec2-dev.optima.shop');
      expect(config.rdsHost).toContain('optima-dev-postgres');
    });

    it('should have consistent service list across environments', () => {
      const envs: Environment[] = ['production', 'stage', 'development'];
      const serviceSets = envs.map(env => {
        process.env.OPTIMA_OPS_ENV = env;
        return getCurrentEnvConfig().services;
      });

      // 所有环境应该有相同的服务
      const firstSet = serviceSets[0];
      serviceSets.forEach(services => {
        expect(services).toEqual(firstSet);
      });
    });

    it('should include ec2InstanceId for production', () => {
      process.env.OPTIMA_OPS_ENV = 'production';
      const config = getCurrentEnvConfig();

      expect(config.ec2InstanceId).toBeDefined();
      expect(config.ec2InstanceId).toMatch(/^i-/); // AWS instance ID pattern
    });

    it('should include dockerNetwork', () => {
      process.env.OPTIMA_OPS_ENV = 'production';
      const config = getCurrentEnvConfig();

      expect(config.dockerNetwork).toBe('optima-prod');
    });

    it('should include githubRunner', () => {
      process.env.OPTIMA_OPS_ENV = 'production';
      const config = getCurrentEnvConfig();

      expect(config.githubRunner).toBe('optima-prod-host');
    });
  });

  describe('getAWSRegion', () => {
    const originalRegion = process.env.AWS_REGION;

    afterEach(() => {
      if (originalRegion) {
        process.env.AWS_REGION = originalRegion;
      } else {
        delete process.env.AWS_REGION;
      }
    });

    it('should return AWS_REGION from environment', () => {
      process.env.AWS_REGION = 'us-east-1';
      expect(getAWSRegion()).toBe('us-east-1');
    });

    it('should return default region if not set', () => {
      delete process.env.AWS_REGION;
      const region = getAWSRegion();
      expect(region).toBe('ap-southeast-1'); // default region
    });
  });

  describe('Service names validation', () => {
    it('should include all expected services', () => {
      const config = getCurrentEnvConfig();
      const expectedServices = [
        'user-auth',
        'mcp-host',
        'commerce-backend',
        'agentic-chat',
      ];

      expectedServices.forEach(service => {
        expect(config.services).toContain(service);
      });
    });

    it('should have valid service count', () => {
      const config = getCurrentEnvConfig();
      expect(config.services.length).toBeGreaterThanOrEqual(4);
    });
  });
});
