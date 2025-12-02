import Conf from 'conf';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '../..');
const servicesConfigPath = join(projectRoot, 'services-config.json');

// ============== 类型定义 ==============

// 旧版环境类型（向后兼容）
export type Environment = 'production' | 'stage' | 'shared' | 'development' | 'bi-data';

// 新版环境类型（多环境架构）
export type TargetEnvironment = 'ec2-prod' | 'ecs-stage' | 'ecs-prod' | 'bi-data';
export type EnvironmentType = 'ec2' | 'ecs';

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
    shared: EC2Config;
    development: EC2Config;
    'bi-data': EC2Config;
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
    ec2Environment: 'production',
    rdsHost: 'optima-prod-postgres.ctg866o0ehac.ap-southeast-1.rds.amazonaws.com',
    albDnsName: 'optima-prod-alb-1234567890.ap-southeast-1.elb.amazonaws.com',
    dockerNetwork: 'optima-prod',
    githubRunner: 'optima-prod-host',
    services: ['user-auth', 'mcp-host', 'commerce-backend', 'agentic-chat'],
  },
  stage: {
    ec2Host: 'ec2-stage.optima.shop',
    ec2Environment: 'stage',
    rdsHost: 'optima-stage-postgres.ctg866o0ehac.ap-southeast-1.rds.amazonaws.com',
    albDnsName: 'optima-stage-alb-1234567890.ap-southeast-1.elb.amazonaws.com',
    dockerNetwork: 'optima-stage',
    githubRunner: 'optima-stage-host',
    services: ['user-auth', 'mcp-host', 'commerce-backend', 'agentic-chat'],
  },
  shared: {
    ec2Host: 'shared.optima.onl',
    ec2Environment: 'shared',
    rdsHost: '',
    albDnsName: '',
    dockerNetwork: 'optima-shared',
    githubRunner: 'optima-shared-host',
    services: [],
  },
  development: {
    ec2Host: 'ec2-dev.optima.shop',
    ec2Environment: 'development',
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
      shared: {
        host: 'shared.optima.onl',
        user: 'ec2-user',
        keyPath: join(homedir(), '.ssh', 'optima-ec2-key'),
      },
      development: {
        host: 'ec2-dev.optima.shop',
        user: 'ec2-user',
        keyPath: join(homedir(), '.ssh', 'optima-ec2-key'),
      },
      'bi-data': {
        host: 'bi-data.optima.onl',
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

// ============== 服务配置 ==============

export interface ServiceConfig {
  name: string;
  repo: string;
  container: string;
  healthEndpoint: string;
  type: 'core' | 'mcp';
  port?: number;
  hasDatabase: boolean;
  hasRedis: boolean;
}

interface ServicesConfigFile {
  services: {
    core: ServiceConfig[];
    mcp: ServiceConfig[];
  };
}

let cachedServicesConfig: ServicesConfigFile | null = null;

/**
 * 加载服务配置文件
 */
function loadServicesConfig(): ServicesConfigFile {
  if (cachedServicesConfig) {
    return cachedServicesConfig;
  }

  if (!existsSync(servicesConfigPath)) {
    throw new Error(`服务配置文件不存在: ${servicesConfigPath}`);
  }

  try {
    const content = readFileSync(servicesConfigPath, 'utf-8');
    cachedServicesConfig = JSON.parse(content);
    return cachedServicesConfig!;
  } catch (error: any) {
    throw new Error(`读取服务配置文件失败: ${error.message}`);
  }
}

/**
 * 获取所有服务配置
 */
export function getAllServices(): ServiceConfig[] {
  const config = loadServicesConfig();
  return [...config.services.core, ...config.services.mcp];
}

/**
 * 获取特定类型的服务
 */
export function getServicesByType(type: 'core' | 'mcp'): ServiceConfig[] {
  const config = loadServicesConfig();
  return type === 'core' ? config.services.core : config.services.mcp;
}

/**
 * 获取单个服务配置
 */
export function getServiceConfig(name: string): ServiceConfig | null {
  const allServices = getAllServices();
  return allServices.find(s => s.name === name) || null;
}

/**
 * 获取服务名称列表（用于向后兼容）
 */
export function getServiceNames(type?: 'core' | 'mcp' | 'all'): string[] {
  if (type === 'core') {
    return getServicesByType('core').map(s => s.name);
  } else if (type === 'mcp') {
    return getServicesByType('mcp').map(s => s.name);
  } else {
    return getAllServices().map(s => s.name);
  }
}

// ============== 新版多环境配置 ==============

export interface EnvironmentConfig {
  type: EnvironmentType;
  host?: string;
  cluster?: string;
  domain: string;
  dockerNetwork?: string;
  description: string;
  services?: string[];
}

export interface ServiceEnvironmentConfig {
  container?: string;
  service?: string;
  healthEndpoint: string;
  port?: number;
}

export interface ServiceConfigV2 {
  name: string;
  repo: string;
  type: 'core' | 'mcp' | 'bi';
  hasDatabase: boolean;
  hasRedis: boolean;
  environments: {
    [key in TargetEnvironment]?: ServiceEnvironmentConfig;
  };
}

interface ServicesConfigFileV2 {
  environments: {
    [key in TargetEnvironment]: EnvironmentConfig;
  };
  services: {
    core: ServiceConfigV2[];
    mcp: ServiceConfigV2[];
    bi: ServiceConfigV2[];
  };
}

let cachedServicesConfigV2: ServicesConfigFileV2 | null = null;

/**
 * 加载新版服务配置文件
 */
function loadServicesConfigV2(): ServicesConfigFileV2 {
  if (cachedServicesConfigV2) {
    return cachedServicesConfigV2;
  }

  if (!existsSync(servicesConfigPath)) {
    throw new Error(`服务配置文件不存在: ${servicesConfigPath}`);
  }

  try {
    const content = readFileSync(servicesConfigPath, 'utf-8');
    cachedServicesConfigV2 = JSON.parse(content);
    return cachedServicesConfigV2!;
  } catch (error: any) {
    throw new Error(`读取服务配置文件失败: ${error.message}`);
  }
}

/**
 * 获取所有环境配置
 */
export function getEnvironments(): { [key in TargetEnvironment]: EnvironmentConfig } {
  const config = loadServicesConfigV2();
  return config.environments;
}

/**
 * 获取特定环境配置
 */
export function getEnvironmentConfig(env: TargetEnvironment): EnvironmentConfig {
  const envs = getEnvironments();
  if (!envs[env]) {
    throw new Error(`未知环境: ${env}。可用环境: ${Object.keys(envs).join(', ')}`);
  }
  return envs[env];
}

/**
 * 获取当前目标环境（从环境变量或配置）
 */
export function getCurrentTargetEnvironment(): TargetEnvironment | null {
  const env = process.env.OPTIMA_TARGET_ENV as TargetEnvironment;
  if (env && isValidTargetEnvironment(env)) {
    return env;
  }
  return config.get('targetEnvironment' as any) || null;
}

/**
 * 设置当前目标环境
 */
export function setCurrentTargetEnvironment(env: TargetEnvironment): void {
  config.set('targetEnvironment' as any, env);
}

/**
 * 验证环境值是否有效
 */
export function isValidTargetEnvironment(env: string): env is TargetEnvironment {
  return ['ec2-prod', 'ecs-stage', 'ecs-prod', 'bi-data'].includes(env);
}

/**
 * 获取所有服务配置 V2
 */
export function getAllServicesV2(): ServiceConfigV2[] {
  const config = loadServicesConfigV2();
  return [
    ...config.services.core,
    ...config.services.mcp,
    ...(config.services.bi || []),
  ];
}

/**
 * 获取特定类型的服务 V2
 */
export function getServicesByTypeV2(type: 'core' | 'mcp' | 'bi'): ServiceConfigV2[] {
  const config = loadServicesConfigV2();
  return config.services[type] || [];
}

/**
 * 获取特定环境下的服务配置
 */
export function getServiceForEnvironment(
  serviceName: string,
  env: TargetEnvironment
): { service: ServiceConfigV2; envConfig: ServiceEnvironmentConfig } | null {
  const allServices = getAllServicesV2();
  const service = allServices.find(s => s.name === serviceName);

  if (!service) {
    return null;
  }

  const envConfig = service.environments[env];
  if (!envConfig) {
    return null;
  }

  return { service, envConfig };
}

/**
 * 获取环境下所有可用的服务
 */
export function getServicesInEnvironment(env: TargetEnvironment): ServiceConfigV2[] {
  const allServices = getAllServicesV2();
  return allServices.filter(s => s.environments[env] !== undefined);
}

/**
 * 解析 --env 参数，支持旧版和新版格式
 */
export function resolveEnvironment(envArg?: string): TargetEnvironment {
  // 如果提供了参数，验证并返回
  if (envArg) {
    if (isValidTargetEnvironment(envArg)) {
      return envArg;
    }
    // 兼容旧版格式
    const mapping: { [key: string]: TargetEnvironment } = {
      'production': 'ec2-prod',
      'prod': 'ec2-prod',
      'stage': 'ecs-stage',
      'staging': 'ecs-stage',
    };
    if (mapping[envArg]) {
      return mapping[envArg];
    }
    throw new Error(`未知环境: ${envArg}。可用环境: ec2-prod, ecs-stage, ecs-prod, bi-data`);
  }

  // 从环境变量或配置读取
  const currentEnv = getCurrentTargetEnvironment();
  if (currentEnv) {
    return currentEnv;
  }

  throw new Error('请指定环境: --env <ec2-prod|ecs-stage|ecs-prod|bi-data>');
}

/**
 * 获取 ECS 集群名称
 */
export function getECSCluster(env: TargetEnvironment): string {
  const envConfig = getEnvironmentConfig(env);
  if (envConfig.type !== 'ecs') {
    throw new Error(`环境 ${env} 不是 ECS 类型`);
  }
  return envConfig.cluster!;
}

/**
 * 获取 EC2 主机地址
 */
export function getEC2Host(env: TargetEnvironment): string {
  const envConfig = getEnvironmentConfig(env);
  if (envConfig.type !== 'ec2') {
    throw new Error(`环境 ${env} 不是 EC2 类型`);
  }
  return envConfig.host!;
}
