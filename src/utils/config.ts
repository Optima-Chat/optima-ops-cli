import Conf from 'conf';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

// ============== 类型定义 ==============

export type Environment = 'production' | 'stage' | 'development';

interface EC2Config {
  host: string;
  user: string;
  keyPath: string;
}

interface ConfigSchema {
  environment: Environment;
  ec2: {
    production: EC2Config;
    stage: EC2Config;
    development: EC2Config;
  };
  aws: {
    region: string;
    profile?: string;
  };
}

// ============== 环境配置常量 ==============

export const ENV_CONFIG = {
  production: {
    ec2Host: 'ec2-prod.optima.shop',
    ec2InstanceId: 'i-0c579b1b947262265',
    rdsHost: 'optima-prod-postgres.ctg866o0ehac.ap-southeast-1.rds.amazonaws.com',
    albDnsName: 'optima-prod-alb-1234567890.ap-southeast-1.elb.amazonaws.com',
    dockerNetwork: 'optima-prod',
    githubRunner: 'optima-prod-host',
    services: ['user-auth', 'mcp-host', 'commerce-backend', 'agentic-chat'],
  },
  stage: {
    ec2Host: 'ec2-stage.optima.shop',
    ec2InstanceId: 'i-066927482ec6322a6',
    rdsHost: 'optima-stage-postgres.ctg866o0ehac.ap-southeast-1.rds.amazonaws.com',
    albDnsName: 'optima-stage-alb-1234567890.ap-southeast-1.elb.amazonaws.com',
    dockerNetwork: 'optima-stage',
    githubRunner: 'optima-stage-host',
    services: ['user-auth', 'mcp-host', 'commerce-backend', 'agentic-chat'],
  },
  development: {
    ec2Host: 'ec2-dev.optima.shop',
    ec2InstanceId: 'i-0000000000000000',
    rdsHost: 'optima-dev-postgres.ctg866o0ehac.ap-southeast-1.rds.amazonaws.com',
    albDnsName: 'optima-dev-alb-1234567890.ap-southeast-1.elb.amazonaws.com',
    dockerNetwork: 'optima-dev',
    githubRunner: 'optima-dev-host',
    services: ['user-auth', 'mcp-host', 'commerce-backend', 'agentic-chat'],
  },
} as const;

// ============== 配置实例 ==============

const config = new Conf<ConfigSchema>({
  projectName: 'optima-ops-cli',
  defaults: {
    environment: 'production',
    ec2: {
      production: {
        host: 'ec2-prod.optima.shop',
        user: 'ec2-user',
        keyPath: join(homedir(), '.ssh', 'optima-ec2-key'),
      },
      stage: {
        host: 'ec2-stage.optima.shop',
        user: 'ec2-user',
        keyPath: join(homedir(), '.ssh', 'optima-ec2-key'),
      },
      development: {
        host: 'ec2-dev.optima.shop',
        user: 'ec2-user',
        keyPath: join(homedir(), '.ssh', 'optima-ec2-key'),
      },
    },
    aws: {
      region: 'ap-southeast-1',
    },
  },
});

// ============== 配置访问函数 ==============

/**
 * 获取当前激活的环境
 */
export function getCurrentEnvironment(): Environment {
  // 优先从环境变量读取
  const envFromEnv = process.env.OPTIMA_OPS_ENV as Environment;
  if (envFromEnv && ['production', 'stage', 'development'].includes(envFromEnv)) {
    return envFromEnv;
  }

  // 从配置文件读取
  return config.get('environment');
}

/**
 * 设置当前环境
 */
export function setCurrentEnvironment(env: Environment): void {
  config.set('environment', env);
}

/**
 * 获取当前环境的配置
 */
export function getCurrentEnvConfig() {
  const env = getCurrentEnvironment();
  return ENV_CONFIG[env];
}

/**
 * 获取 EC2 配置
 */
export function getEC2Config(env?: Environment): EC2Config {
  const targetEnv = env || getCurrentEnvironment();
  return config.get(`ec2.${targetEnv}`);
}

/**
 * 获取 AWS 配置
 */
export function getAWSConfig() {
  return config.get('aws');
}

/**
 * 获取 SSH 密钥路径
 */
export function getSSHKeyPath(env?: Environment): string {
  const ec2Config = getEC2Config(env);

  // 优先使用环境变量
  if (process.env.OPTIMA_SSH_KEY) {
    return process.env.OPTIMA_SSH_KEY;
  }

  return ec2Config.keyPath;
}

/**
 * 读取 SSH 私钥内容
 */
export function getSSHPrivateKey(env?: Environment): string {
  const keyPath = getSSHKeyPath(env);

  if (!existsSync(keyPath)) {
    throw new Error(
      `SSH 密钥文件不存在: ${keyPath}\n` +
      `请运行以下命令获取密钥:\n` +
      `aws ssm get-parameter --name /optima/ec2/ssh-private-key --with-decryption --query Parameter.Value --output text > ${keyPath}\n` +
      `chmod 600 ${keyPath}`
    );
  }

  return readFileSync(keyPath, 'utf-8');
}

/**
 * 获取 AWS Region
 */
export function getAWSRegion(): string {
  return process.env.AWS_REGION || config.get('aws.region');
}

/**
 * 获取配置文件路径
 */
export function getConfigPath(): string {
  return config.path;
}
