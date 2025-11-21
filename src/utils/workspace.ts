/**
 * Workspace 工具模块
 *
 * 用于查找和解析 optima-workspace 配置，获取服务路径
 *
 * 查找策略：
 * 1. 环境变量 OPTIMA_WORKSPACE_ROOT
 * 2. 从当前目录向上查找 workspace.yaml
 * 3. 从 optima-ops-cli 的父目录查找（假设 cli-tools/optima-ops-cli 在 workspace 下）
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

/**
 * Workspace 配置结构
 */
export interface WorkspaceConfig {
  version: string;
  github_org: string;
  groups: Record<string, WorkspaceGroup>;
  defaults?: {
    clone_depth?: number;
    ssh_clone?: boolean;
    auto_pull?: boolean;
    default_branch?: string;
  };
}

export interface WorkspaceGroup {
  description?: string;
  repos: WorkspaceRepo[];
}

export interface WorkspaceRepo {
  name: string;
  repo: string;
  branch?: string;
  description?: string;
}

/**
 * 本地配置结构 (config.local.yaml)
 */
export interface LocalConfig {
  workspace_root?: string;
  private_repos?: PrivateRepo[];
  sync?: SyncConfig;
  infisical?: {
    client_id?: string;
    client_secret?: string;
    site_url?: string;
  };
  aws?: {
    profile?: string;
    region?: string;
  };
}

export interface PrivateRepo {
  name: string;
  path: string;
  repo: string;
  branch?: string;
}

export interface SyncConfig {
  /** 要同步的组（如果设置，只同步这些组） */
  include_groups?: string[];
  /** 要跳过的组 */
  skip_groups?: string[];
  /** 强制 pull（忽略本地更改） */
  force_pull?: boolean;
}

// 缓存
let cachedWorkspaceRoot: string | null = null;
let cachedWorkspaceConfig: WorkspaceConfig | null = null;
let cachedLocalConfig: LocalConfig | null = null;

/**
 * 查找 workspace.yaml 文件
 * @param startDir 起始目录
 * @returns workspace.yaml 的完整路径，未找到返回 null
 */
function findWorkspaceYaml(startDir: string): string | null {
  let currentDir = startDir;
  const root = path.parse(currentDir).root;

  while (currentDir !== root) {
    const workspaceYaml = path.join(currentDir, 'workspace.yaml');
    if (fs.existsSync(workspaceYaml)) {
      return workspaceYaml;
    }
    currentDir = path.dirname(currentDir);
  }

  return null;
}

/**
 * 获取 workspace 根目录
 *
 * 查找优先级：
 * 1. 环境变量 OPTIMA_WORKSPACE_ROOT
 * 2. 从当前目录向上查找 workspace.yaml
 * 3. 从 optima-ops-cli 位置推断（假设在 cli-tools/optima-ops-cli 下）
 *
 * @returns workspace 根目录路径，未找到返回 null
 */
export function getWorkspaceRoot(): string | null {
  if (cachedWorkspaceRoot !== null) {
    return cachedWorkspaceRoot;
  }

  // 1. 环境变量
  if (process.env.OPTIMA_WORKSPACE_ROOT) {
    const envRoot = process.env.OPTIMA_WORKSPACE_ROOT;
    if (fs.existsSync(path.join(envRoot, 'workspace.yaml'))) {
      cachedWorkspaceRoot = envRoot;
      return cachedWorkspaceRoot;
    }
  }

  // 2. 从当前目录向上查找
  const fromCwd = findWorkspaceYaml(process.cwd());
  if (fromCwd) {
    cachedWorkspaceRoot = path.dirname(fromCwd);
    return cachedWorkspaceRoot;
  }

  // 3. 从 optima-ops-cli 位置推断
  // 假设目录结构: workspace/cli-tools/optima-ops-cli/
  const cliDir = path.dirname(path.dirname(new URL(import.meta.url).pathname));
  const potentialWorkspace = path.dirname(path.dirname(cliDir));
  const fromCli = findWorkspaceYaml(potentialWorkspace);
  if (fromCli) {
    cachedWorkspaceRoot = path.dirname(fromCli);
    return cachedWorkspaceRoot;
  }

  return null;
}

/**
 * 加载 workspace.yaml 配置
 */
export function loadWorkspaceConfig(): WorkspaceConfig | null {
  if (cachedWorkspaceConfig !== null) {
    return cachedWorkspaceConfig;
  }

  const workspaceRoot = getWorkspaceRoot();
  if (!workspaceRoot) {
    return null;
  }

  const configPath = path.join(workspaceRoot, 'workspace.yaml');
  if (!fs.existsSync(configPath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    cachedWorkspaceConfig = yaml.load(content) as WorkspaceConfig;
    return cachedWorkspaceConfig;
  } catch (error) {
    console.error(`加载 workspace.yaml 失败: ${error}`);
    return null;
  }
}

/**
 * 加载本地配置 (config.local.yaml)
 */
export function loadLocalConfig(): LocalConfig | null {
  if (cachedLocalConfig !== null) {
    return cachedLocalConfig;
  }

  const workspaceRoot = getWorkspaceRoot();
  if (!workspaceRoot) {
    return null;
  }

  const configPath = path.join(workspaceRoot, 'config.local.yaml');
  if (!fs.existsSync(configPath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    cachedLocalConfig = yaml.load(content) as LocalConfig;
    return cachedLocalConfig;
  } catch (error) {
    console.error(`加载 config.local.yaml 失败: ${error}`);
    return null;
  }
}

/**
 * 获取服务所在的组名
 */
export function getServiceGroup(service: string): string | null {
  const config = loadWorkspaceConfig();
  if (!config) {
    return null;
  }

  for (const [groupName, group] of Object.entries(config.groups)) {
    const repo = group.repos.find((r) => r.name === service);
    if (repo) {
      return groupName;
    }
  }

  return null;
}

/**
 * 获取服务仓库路径
 *
 * @param service 服务名称 (如 user-auth, mcp-host)
 * @returns 服务仓库的完整路径，未找到返回 null
 */
export function getServicePath(service: string): string | null {
  const workspaceRoot = getWorkspaceRoot();
  if (!workspaceRoot) {
    return null;
  }

  const config = loadWorkspaceConfig();
  if (!config) {
    return null;
  }

  // 在所有组中查找服务
  for (const [groupName, group] of Object.entries(config.groups)) {
    const repo = group.repos.find((r) => r.name === service);
    if (repo) {
      return path.join(workspaceRoot, groupName, repo.name);
    }
  }

  // 检查私有仓库
  const localConfig = loadLocalConfig();
  if (localConfig?.private_repos) {
    const privateRepo = localConfig.private_repos.find((r) => r.name === service);
    if (privateRepo) {
      return path.join(workspaceRoot, privateRepo.path);
    }
  }

  return null;
}

/**
 * 获取所有服务列表
 */
export function getAllServices(): string[] {
  const config = loadWorkspaceConfig();
  if (!config) {
    return [];
  }

  const services: string[] = [];
  for (const group of Object.values(config.groups)) {
    for (const repo of group.repos) {
      services.push(repo.name);
    }
  }

  return services;
}

/**
 * 获取指定组的所有服务
 */
export function getServicesInGroup(groupName: string): string[] {
  const config = loadWorkspaceConfig();
  if (!config) {
    return [];
  }

  const group = config.groups[groupName];
  if (!group) {
    return [];
  }

  return group.repos.map((r) => r.name);
}

/**
 * 检查是否在 workspace 环境中
 */
export function isInWorkspace(): boolean {
  return getWorkspaceRoot() !== null;
}

/**
 * 清除缓存（用于测试）
 */
export function clearCache(): void {
  cachedWorkspaceRoot = null;
  cachedWorkspaceConfig = null;
  cachedLocalConfig = null;
}

/**
 * 打印 workspace 信息（用于调试）
 */
export function printWorkspaceInfo(): void {
  const root = getWorkspaceRoot();
  const config = loadWorkspaceConfig();
  const localConfig = loadLocalConfig();

  console.log('Workspace Information:');
  console.log(`  Root: ${root || 'Not found'}`);

  if (config) {
    console.log(`  Version: ${config.version}`);
    console.log(`  GitHub Org: ${config.github_org}`);
    console.log(`  Groups: ${Object.keys(config.groups).join(', ')}`);

    let totalRepos = 0;
    for (const group of Object.values(config.groups)) {
      totalRepos += group.repos.length;
    }
    console.log(`  Total Repos: ${totalRepos}`);
  }

  if (localConfig) {
    console.log('  Local Config:');
    if (localConfig.sync?.include_groups) {
      console.log(`    Include Groups: ${localConfig.sync.include_groups.join(', ')}`);
    }
    if (localConfig.sync?.skip_groups) {
      console.log(`    Skip Groups: ${localConfig.sync.skip_groups.join(', ')}`);
    }
    if (localConfig.private_repos?.length) {
      console.log(`    Private Repos: ${localConfig.private_repos.length}`);
    }
  }
}
