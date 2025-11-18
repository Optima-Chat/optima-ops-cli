import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

interface ServiceConfig {
  name: string;
  repo: string;
  container: string;
  healthEndpoint: string;
  type: 'core' | 'mcp';
  hasDatabase: boolean;
  hasRedis: boolean;
  port?: number;
}

interface ServicesConfig {
  services: {
    core: ServiceConfig[];
    mcp: ServiceConfig[];
  };
}

let cachedConfig: ServicesConfig | null = null;

/**
 * 加载 services-config.json
 */
export function loadServicesConfig(): ServicesConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const configPath = path.join(__dirname, '../../services-config.json');
  const content = fs.readFileSync(configPath, 'utf-8');
  cachedConfig = JSON.parse(content) as ServicesConfig;

  return cachedConfig;
}

/**
 * 获取所有服务列表
 */
export function getAllServices(): ServiceConfig[] {
  const config = loadServicesConfig();
  return [...config.services.core, ...config.services.mcp];
}

/**
 * 获取核心服务
 */
export function getCoreServices(): ServiceConfig[] {
  const config = loadServicesConfig();
  return config.services.core;
}

/**
 * 获取 MCP 服务
 */
export function getMCPServices(): ServiceConfig[] {
  const config = loadServicesConfig();
  return config.services.mcp;
}

/**
 * 按类型获取服务
 */
export function getServicesByType(type: 'core' | 'mcp' | 'all'): ServiceConfig[] {
  if (type === 'all') {
    return getAllServices();
  }
  if (type === 'core') {
    return getCoreServices();
  }
  return getMCPServices();
}
