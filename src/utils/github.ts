import { exec } from 'child_process';
import { promisify } from 'util';
import { CommandExecutionError } from './error.js';

const execAsync = promisify(exec);

// ============== GitHub CLI 包装器 ==============

export interface GitHubRun {
  id: number;  // Using databaseId from GitHub API
  number: number;  // Run number (sequential)
  status: 'queued' | 'in_progress' | 'completed';
  conclusion?: 'success' | 'failure' | 'cancelled' | 'skipped';
  workflowName: string;
  event: string;
  branch: string;
  commit: string;
  startedAt: string;
  updatedAt: string;
  url: string;
}

export interface GitHubJob {
  id: number;
  name: string;
  status: 'queued' | 'in_progress' | 'completed';
  conclusion?: 'success' | 'failure' | 'cancelled' | 'skipped';
  startedAt: string;
  completedAt?: string;
  url: string;
}

/**
 * 检查 GitHub CLI 是否已安装
 */
export async function checkGHCLI(): Promise<boolean> {
  try {
    await execAsync('gh --version');
    return true;
  } catch {
    return false;
  }
}

/**
 * 执行 gh 命令
 */
async function executeGH(command: string): Promise<string> {
  const hasGH = await checkGHCLI();
  if (!hasGH) {
    throw new CommandExecutionError(
      'GitHub CLI (gh) 未安装。请访问 https://cli.github.com/ 安装'
    );
  }

  try {
    const { stdout, stderr } = await execAsync(`gh ${command}`);
    if (stderr && !stderr.includes('WARNING')) {
      throw new Error(stderr);
    }
    return stdout.trim();
  } catch (error: any) {
    throw new CommandExecutionError(
      `GitHub CLI 命令执行失败: ${error.message}`,
      { command, error: error.message }
    );
  }
}

/**
 * 获取仓库的 workflow runs
 */
export async function getWorkflowRuns(
  repo: string,
  options?: {
    workflow?: string;
    branch?: string;
    limit?: number;
  }
): Promise<GitHubRun[]> {
  let command = `run list --repo ${repo} --json databaseId,number,status,conclusion,workflowName,event,headBranch,headSha,startedAt,updatedAt,url`;

  if (options?.workflow) {
    command += ` --workflow "${options.workflow}"`;
  }

  if (options?.branch) {
    command += ` --branch ${options.branch}`;
  }

  if (options?.limit) {
    command += ` --limit ${options.limit}`;
  }

  const output = await executeGH(command);
  const runs = JSON.parse(output);

  return runs.map((run: any) => ({
    id: run.databaseId,
    number: run.number,
    status: run.status,
    conclusion: run.conclusion,
    workflowName: run.workflowName,
    event: run.event,
    branch: run.headBranch,
    commit: run.headSha ? run.headSha.substring(0, 7) : 'unknown',
    startedAt: run.startedAt,
    updatedAt: run.updatedAt,
    url: run.url,
  }));
}

/**
 * 获取特定 run 的详情
 */
export async function getRunDetails(repo: string, runId: number): Promise<GitHubRun> {
  const command = `run view ${runId} --repo ${repo} --json databaseId,number,status,conclusion,workflowName,event,headBranch,headSha,startedAt,updatedAt,url`;
  const output = await executeGH(command);
  const run = JSON.parse(output);

  return {
    id: run.databaseId,
    number: run.number,
    status: run.status,
    conclusion: run.conclusion,
    workflowName: run.workflowName,
    event: run.event,
    branch: run.headBranch,
    commit: run.headSha.substring(0, 7),
    startedAt: run.startedAt,
    updatedAt: run.updatedAt,
    url: run.url,
  };
}

/**
 * 获取 run 的 jobs
 */
export async function getRunJobs(repo: string, runId: number): Promise<GitHubJob[]> {
  const command = `run view ${runId} --repo ${repo} --json jobs`;
  const output = await executeGH(command);
  const data = JSON.parse(output);

  if (!data.jobs) {
    return [];
  }

  return data.jobs.map((job: any) => ({
    id: job.id,
    name: job.name,
    status: job.status,
    conclusion: job.conclusion,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    url: job.url,
  }));
}

/**
 * 获取 run 的日志
 */
export async function getRunLogs(repo: string, runId: number): Promise<string> {
  const command = `run view ${runId} --repo ${repo} --log`;
  return await executeGH(command);
}

/**
 * 监视 run 的执行
 */
export async function watchRun(repo: string, runId: number): Promise<void> {
  const command = `run watch ${runId} --repo ${repo}`;
  // 这个命令会一直运行直到 workflow 完成，所以不使用 executeGH
  const hasGH = await checkGHCLI();
  if (!hasGH) {
    throw new CommandExecutionError(
      'GitHub CLI (gh) 未安装。请访问 https://cli.github.com/ 安装'
    );
  }

  return new Promise((resolve, reject) => {
    const child = exec(`gh ${command}`);

    child.stdout?.on('data', (data) => {
      process.stdout.write(data);
    });

    child.stderr?.on('data', (data) => {
      process.stderr.write(data);
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new CommandExecutionError(`Watch 命令失败，退出码: ${code}`));
      }
    });
  });
}

/**
 * 触发 workflow
 */
export async function triggerWorkflow(
  repo: string,
  workflow: string,
  options?: {
    ref?: string;
    inputs?: Record<string, string>;
  }
): Promise<void> {
  let command = `workflow run "${workflow}" --repo ${repo}`;

  if (options?.ref) {
    command += ` --ref ${options.ref}`;
  }

  if (options?.inputs) {
    for (const [key, value] of Object.entries(options.inputs)) {
      command += ` -f ${key}="${value}"`;
    }
  }

  await executeGH(command);
}

/**
 * 触发仓库的 dispatch 事件
 */
export async function triggerDispatch(
  repo: string,
  eventType: string,
  inputs?: Record<string, any>
): Promise<void> {
  let command = `api repos/${repo}/dispatches -f event_type=${eventType}`;

  if (inputs) {
    command += ` -f client_payload='${JSON.stringify(inputs)}'`;
  }

  await executeGH(command);
}

/**
 * 获取服务对应的 GitHub 仓库名
 */
export function getServiceRepo(service: string): string {
  const repoMap: Record<string, string> = {
    'user-auth': 'Optima-Chat/user-auth',
    'mcp-host': 'Optima-Chat/mcp-host',
    'commerce-backend': 'Optima-Chat/commerce-backend',
    'agentic-chat': 'Optima-Chat/agentic-chat',
  };

  return repoMap[service] || `Optima-Chat/${service}`;
}

/**
 * 自动检测仓库的部署 workflow 文件名
 */
export async function getDeployWorkflow(repo: string): Promise<string | null> {
  try {
    const output = await executeGH(
      `api repos/${repo}/actions/workflows --jq '.workflows[] | select(.path | contains("deploy")) | .path'`
    );

    if (!output || output.trim() === '') {
      return null;
    }

    const workflows = output.split('\n').filter(w => w.trim() && !w.includes('WARNING'));

    if (workflows.length === 0) {
      return null;
    }

    // 优先级排序
    const priority = [
      'deploy-aws-prod.yml',
      'deploy-unified.yml',
      'deploy.yml',
    ];

    for (const preferred of priority) {
      const match = workflows.find(w => w.endsWith(preferred));
      if (match) {
        const parts = match.split('/');
        const filename = parts[parts.length - 1];
        return filename || null;
      }
    }

    if (workflows[0]) {
      const parts = workflows[0].split('/');
      return parts[parts.length - 1] || null;
    }

    return null;
  } catch (error) {
    return 'deploy-aws-prod.yml';
  }
}
