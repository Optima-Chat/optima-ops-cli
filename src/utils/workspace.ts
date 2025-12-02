import { existsSync } from 'fs';
import { join, dirname } from 'path';

/**
 * 获取 Optima Workspace 根目录
 *
 * 查找顺序:
 * 1. 环境变量 OPTIMA_WORKSPACE_ROOT
 * 2. 向上遍历目录查找包含 workspace.yaml 的目录
 *
 * @returns workspace 根目录路径，未找到返回 null
 */
export function getWorkspaceRoot(): string | null {
  // 1. 环境变量优先
  if (process.env.OPTIMA_WORKSPACE_ROOT) {
    const root = process.env.OPTIMA_WORKSPACE_ROOT;
    if (existsSync(join(root, 'workspace.yaml'))) {
      return root;
    }
  }

  // 2. 向上遍历查找 workspace.yaml
  let currentDir = process.cwd();
  const root = dirname(currentDir);

  while (currentDir !== root) {
    const workspaceYaml = join(currentDir, 'workspace.yaml');
    if (existsSync(workspaceYaml)) {
      return currentDir;
    }
    currentDir = dirname(currentDir);
  }

  // 3. 常见的 workspace 路径
  const commonPaths = [
    '/mnt/d/optima-workspace',
    '/home/ec2-user/optima-workspace',
    join(process.env.HOME || '', 'optima-workspace'),
  ];

  for (const p of commonPaths) {
    if (existsSync(join(p, 'workspace.yaml'))) {
      return p;
    }
  }

  return null;
}

/**
 * 获取服务路径
 *
 * @param serviceName 服务名称（如 user-auth, mcp-host）
 * @returns 服务路径，未找到返回 null
 */
export function getServicePath(serviceName: string): string | null {
  const workspaceRoot = getWorkspaceRoot();
  if (!workspaceRoot) {
    return null;
  }

  // 服务路径映射
  const servicePathMap: Record<string, string> = {
    'user-auth': 'core-services/user-auth',
    'mcp-host': 'core-services/mcp-host',
    'commerce-backend': 'core-services/commerce-backend',
    'agentic-chat': 'core-services/agentic-chat',
    // MCP 工具
    'comfy-mcp': 'mcp-tools/comfy-mcp',
    'fetch-mcp': 'mcp-tools/fetch-mcp',
    'perplexity-mcp': 'mcp-tools/perplexity-mcp',
    'shopify-mcp': 'mcp-tools/shopify-mcp',
    'commerce-mcp': 'mcp-tools/commerce-mcp',
    'google-ads-mcp': 'mcp-tools/google-ads-mcp',
  };

  const relativePath = servicePathMap[serviceName];
  if (relativePath) {
    const fullPath = join(workspaceRoot, relativePath);
    if (existsSync(fullPath)) {
      return fullPath;
    }
  }

  return null;
}
