# CLAUDE.md

本文件为 Claude Code 提供 optima-ops-cli 项目的开发指南。

## 项目概述

Optima Ops CLI - Optima 基础设施的 DevOps 和监控 CLI 工具。提供只读观察、低风险操作命令和部署验证功能，用于管理 EC2 实例、Docker 容器、AWS 资源和 GitHub Actions 部署。

**技术栈**: TypeScript ES Modules, Commander.js, SSH2, AWS SDK v3, Axios, Inquirer.js, Zod, js-yaml

**设计原则**:
1. **只读优先** - 93% 命令纯观察，7% 低风险命令需确认
2. **配置驱动** - 服务和验证规则定义在配置文件中（services-config.json, config-spec.yaml）
3. **完全自动化** - 自动 SSH 隧道、动态 EC2 查找、workflow 检测、密码管理
4. **智能验证** - 理解构建时 vs 运行时变量、SSM 参数转换

**当前状态**: ✅ 生产就绪（50 个命令，10 个服务，8 个模块）

---

## 最新功能 (2025-11-15)

### 配置驱动架构

**services-config.json**: 集中式服务元数据
- 定义所有 10 个服务（4 核心 + 6 MCP）
- 包含 repo、容器名、健康端点、类型
- 新增服务：只需添加一条配置，所有命令自动支持

**config-spec.yaml**（每个服务仓库）:
- 定义所有环境变量 schema（类型、格式、必需性等）
- 使用阶段标记（build_time / deploy_script / container_runtime）
- SSM 参数映射和转换
- 已废弃参数文档
- 环境特定验证规则

### 部署验证系统

**新模块**: `validate`（4 个命令）

```bash
# 查看服务配置规范
optima-ops validate spec user-auth

# 部署前验证（检查 SSM/Infisical 配置）
optima-ops validate pre user-auth

# 部署后验证（检查容器实际环境变量）
optima-ops validate post user-auth

# 环境差异对比（智能分析）
optima-ops validate diff user-auth --from-env prod --to-env stage
```

**核心设计 - 使用阶段**:

环境变量在不同阶段使用，不必所有变量都在容器中可见：

1. **build_time**: Docker 构建时参数（如 NEXT_PUBLIC_*）
   - 通过 `docker build --build-arg` 注入
   - 编译到代码中（Next.js bundles）
   - 运行时不需要

2. **deploy_script**: 部署参数化（如 DEPLOY_ENV, DOCKER_NETWORK）
   - 用于 docker-compose.yml 的 ${CONTAINER_NAME}, ${DOCKER_NETWORK}
   - 不传入容器内部

3. **container_runtime**: 应用运行时变量（如 DATABASE_URL, SECRET_KEY）
   - 通过 docker-compose environment 块传递
   - 容器内可见，应用代码读取

**验证策略**:
- `validate post` 理解缺失构建时变量是正常的
- `validate diff` 知道哪些变量在不同环境应该相同/不同
- `validate pre` 应用 SSM 参数转换（分钟→秒等）

### 自动检测功能

1. **EC2 实例** - 通过 tag:Name 查找，而非硬编码 ID
2. **Workflow 文件** - 自动检测 deploy-aws-prod.yml / deploy-unified.yml
3. **数据库密码** - 自动从 Secrets Manager/SSM/Terraform State 获取
4. **SSH 隧道** - 自动建立到私有 RDS（10.0.10.221:5432）

### 性能优化

- infra network: >30s → ~5s（批量 SSH 调用）
- 计时系统: `export OPTIMA_TIMING=1` 查看性能分解

---

## 实时监控仪表盘 (2025-11-20)

### Monitor TUI Dashboard ⭐ **新增**

**多面板 Terminal UI 监控仪表盘**，实时查看系统、服务、容器状态。

**架构**:
- 默认：5 面板多视图仪表盘 (dashboard.ts)
- 可选：经典单面板精简版 (dashboard-blessed.ts)

**5 个面板详细功能**:

| 面板 | 名称 | 内容 |
|------|------|------|
| Panel 0 | 概览 | 系统整体健康状态汇总（服务、EC2、Docker、蓝绿部署） |
| Panel 1 | 服务健康 | 所有服务详细健康状态（HTTP /health + 容器状态 + 版本/分支/commit + 构建时间） |
| Panel 2 | EC2 资源 | EC2 实例资源使用（CPU、内存、磁盘、运行时间、实例 ID/类型） |
| Panel 3 | Docker 容器 | Docker 容器资源使用（CPU、内存、网络 I/O、版本/分支、运行时长） |
| Panel 4 | 蓝绿部署 | 蓝绿部署状态和流量分配（任务数、健康状态、流量百分比） |

**使用方式**:
```bash
# 启动多面板监控（默认）
optima-ops monitor [--env production|stage] [--interval 5]

# 显式启动多面板
optima-ops monitor dashboard [--env production|stage] [--interval 5]

# 启动经典单面板（精简版）
optima-ops monitor legacy [--env production|stage] [--interval 5]
```

**键盘导航**:
- `0-4`: 直接切换到指定面板
- `Tab` / `Shift+Tab`: 循环切换面板
- `r`: 手动刷新当前面板
- `q` / `Esc`: 退出

**技术特性**:
- ✅ 实时自动刷新（可配置间隔，默认 5 秒）
- ✅ SSH 连接池优化（复用连接，减少开销）
- ✅ 内存优化（使用 Buffer.concat 代替字符串拼接）
- ✅ 后台数据刷新（不阻塞 UI）
- ✅ CPU 使用率计算（通过 /proc/stat 差值计算，而非 top 命令）
- ✅ 完整的构建信息显示（tag、branch、commit、workflow、时间）
- ✅ 离线检测（SSH 超时 10 秒自动标记离线）
- ✅ 彩色主题（Catppuccin Mocha 配色）

**Panel Manager 架构**:
```typescript
// 后台数据刷新，不阻塞 UI
class PanelManager {
  - startBackgroundRefresh(): 定时刷新所有环境数据
  - DataCache: 统一数据缓存层
  - Panel instances: 从缓存读取，立即渲染
}

// 面板系统
- BasePanel: 基础面板类（show/hide/render）
- OverviewPanel: 概览面板（左侧概览 + 右侧错误日志）
- ServicesPanel: 服务健康面板
- EC2Panel: EC2 资源面板
- DockerPanel: Docker 容器面板
- BlueGreenPanel: 蓝绿部署面板
```

**性能优化**:
- SSH 连接复用：减少连接开销
- 批量数据获取：并发获取 prod/stage/shared 环境数据
- 轻量级 CPU 监控：使用 /proc/stat（~100 bytes）代替 top 命令（~300MB）
- Buffer.concat：避免 SSH 流数据字符串拼接导致的内存倍增

**已知限制**:
- CPU 使用率需要 1 秒间隔采样（目前通过缓存优化，避免阻塞）
- 仅支持 Linux 环境（依赖 /proc 文件系统）

---

## 服务覆盖

**10 个服务（100%）**:
- 核心: user-auth, mcp-host, commerce-backend, agentic-chat
- MCP: comfy-mcp, fetch-mcp, perplexity-mcp, shopify-mcp, commerce-mcp, google-ads-mcp

所有 `services` 和 `deploy` 命令支持 `--type core|mcp|all` 过滤。

---

## 快速开始

```bash
# 安装依赖（推荐使用 pnpm，速度更快）
pnpm install
# 或
npm install

# 开发模式（推荐，使用 tsx 直接运行）
npm run dev -- --help
npm run dev -- services health
npm run dev -- validate spec user-auth

# 生产模式
npm start
```

**注意**:
- **推荐使用 pnpm**：速度比 npm 快，节省磁盘空间
- WSL 环境下 `npm run build` (tsc) 可能卡住，推荐使用 `npm run dev` 直接运行 TypeScript

---

## 目录结构

```
src/
├── index.ts                       # CLI 入口点
├── commands/                      # 命令模块
│   ├── monitor/                  # 实时监控（3 命令）⭐ 新增
│   │   ├── index.ts              # Monitor 命令入口
│   │   ├── dashboard.ts          # 多面板 TUI 仪表盘（默认）
│   │   ├── dashboard-blessed.ts  # 经典单面板仪表盘
│   │   └── panels/               # 面板组件
│   │       ├── BasePanel.ts      # 基础面板类
│   │       ├── OverviewPanel.ts  # Panel 0: 概览
│   │       ├── ServicesPanel.ts  # Panel 1: 服务健康
│   │       ├── EC2Panel.ts       # Panel 2: EC2 资源
│   │       ├── DockerPanel.ts    # Panel 3: Docker 容器
│   │       └── BlueGreenPanel.ts # Panel 4: 蓝绿部署
│   ├── services/                 # 服务管理（5 命令）
│   ├── deploy/                   # 部署管理（5 命令）
│   ├── db/                       # 数据库管理（20 命令）
│   ├── infra/                    # 基础设施监控（5 命令）
│   ├── logs/                     # 日志分析（4 命令）
│   ├── config/                   # 配置管理（4 命令）
│   └── validate/                 # 部署验证（4 命令）
├── schemas/                       # ⭐ 新增
│   └── service-schemas/
│       └── user-auth.schema.ts   # user-auth Zod schema
├── loaders/                       # ⭐ 新增
│   ├── config-loader.ts          # 配置加载器（SSM, Container, GitHub）
│   └── spec-loader.ts            # config-spec.yaml 加载器
├── services/                      # 业务逻辑服务层
│   ├── monitor/                  # Monitor 相关服务 ⭐ 新增
│   │   ├── MonitorDataService.ts # 数据获取服务（Services, EC2, Docker）
│   │   ├── BlueGreenService.ts   # 蓝绿部署服务（ECS 任务、流量分配）
│   │   └── DataCache.ts          # 统一数据缓存层
│   └── aws/
│       └── ecs-service.ts        # ECS 服务管理
├── ui/                            # UI 组件层 ⭐ 新增
│   └── blessed/
│       ├── BlessedDashboard.ts   # 经典单面板 UI
│       └── PanelManager.ts       # 多面板管理器（后台刷新、缓存）
├── db/
│   ├── client.ts                 # PostgreSQL 客户端
│   ├── tunnel.ts                 # SSH 隧道管理 ⭐
│   ├── password.ts               # 密码管理
│   └── queries/
│       └── health.ts             # 健康检查查询模板
├── utils/
│   ├── config.ts                 # 环境配置 + 服务加载 ⭐ 更新
│   ├── output.ts                 # 输出格式化
│   ├── error.ts                  # 错误处理
│   ├── prompt.ts                 # 交互式提示
│   ├── ssh.ts                    # SSH 客户端（命令白名单）
│   ├── github.ts                 # GitHub CLI 封装 + workflow 检测 ⭐
│   ├── timer.ts                  # 命令计时系统 ⭐ 新增
│   ├── dashboard-logger.ts       # Dashboard 日志记录器 ⭐ 新增
│   └── aws/
│       ├── ssm.ts                # Parameter Store
│       ├── ec2.ts                # EC2 实例 + 动态查找 ⭐
│       ├── rds.ts                # RDS 数据库
│       └── logs.ts               # CloudWatch Logs
├── types/                         # TypeScript 类型定义 ⭐ 新增
│   └── monitor.ts                # Monitor 相关类型（ServiceHealth, EC2Stats, DockerStats, BlueGreenStatus）
└── services-config.json           # 服务配置 ⭐ 新增
```

---

## 核心设计模式

### 1. 多环境支持

- 配置文件: `~/.config/optima-ops-cli/config.json`
- 环境变量: `OPTIMA_OPS_ENV`
- 每个环境的 EC2/RDS 端点配置

### 2. SSH 命令白名单 (`utils/ssh.ts`)

**只读命令**（允许）:
- `docker ps`, `docker logs`, `docker inspect`, `docker exec env`
- `cat`, `grep`, `ls`, `find`, `tail`, `head`
- `ip`, `df -h`, `free -h`, `uptime`

**低风险命令**（需确认）:
- `docker restart`, `systemctl restart`

**危险命令**（禁止）:
- `rm`, `docker rm`, `shutdown`, `kill`
- Shell 操作符: `>`, `|`, `;`, `&&`

### 3. 双输出格式

- **人类可读**: 彩色表格、格式化文本
- **JSON 格式**: `--json` 标志或 `OPTIMA_OUTPUT=json`

### 4. 配置驱动服务管理

**services-config.json**:
```json
{
  "services": {
    "core": [...],
    "mcp": [...]
  }
}
```

**优势**:
- 新增服务只需添加一条配置
- 所有命令自动支持
- 统一管理，易于维护

### 5. 配置规范驱动验证

**config-spec.yaml** (每个服务仓库):
```yaml
variables:
  DATABASE_URL:
    type: secret
    required: true
    format: url
    env_specific: true

  ACCESS_TOKEN_EXPIRE:
    ssm_param: access-token-expire-minutes
    transform: "multiply(60)"  # SSM 中是分钟，应用需要秒
```

**核心价值**:
- 配置即文档（唯一真相源）
- 自动处理 SSM 参数命名和单位差异
- 理解使用阶段，智能验证

---

## 自动化特性

### 1. 数据库密码管理

```bash
# 首次运行
optima-ops db init-credentials

# 自动从以下位置获取：
# - AWS Secrets Manager: /optima/rds/master-password
# - SSM Parameter Store: /optima/prod/*/db-password
# - Terraform State: s3://optima-terraform-state-*/database-management/terraform.tfstate

# 缓存到本地
# ~/.../optima-ops-cli/.db-credentials.json (已加入 .gitignore)
```

### 2. SSH 隧道自动建立

```typescript
class SSHTunnel {
  async connect(): Promise<number> {
    // 1. SSH 连接到 EC2
    // 2. 端口转发: localhost:随机端口 → 10.0.10.221:5432
    // 3. 返回本地端口
  }
}

class DatabaseClient {
  async connect() {
    const tunnel = new SSHTunnel();
    const port = await tunnel.connect();
    // 连接到 localhost:port（实际到私有 RDS）
  }
}
```

### 3. EC2 实例动态查找

```typescript
async function findEC2InstanceByEnvironment(env: string) {
  const nameMap = {
    production: 'optima-prod-host',
    stage: 'optima-stage-host',
  };

  // 通过 tag:Name 查找
  const instances = await ec2.describeInstances({
    Filters: [
      { Name: 'tag:Name', Values: [nameMap[env]] },
      { Name: 'instance-state-name', Values: ['running'] },
    ],
  });

  return instances[0].InstanceId;
}
```

**优势**: 实例重建后无需修改代码配置

### 4. Workflow 文件自动检测

```typescript
async function getDeployWorkflow(repo: string) {
  // 1. GitHub API 获取所有 workflows
  // 2. 过滤包含 "deploy" 的文件
  // 3. 优先级匹配:
  //    - deploy-aws-prod.yml
  //    - deploy-unified.yml
  //    - deploy.yml
  // 4. 返回找到的文件名
}
```

**优势**: 适配每个仓库不同的 workflow 文件名，自动适应变更

### 5. 配置参数转换

```typescript
// config-spec.yaml 中定义
ACCESS_TOKEN_EXPIRE:
  ssm_param: access-token-expire-minutes
  ssm_unit: minutes
  transform: "multiply(60)"

// ConfigLoader 自动转换
const ssmValue = 30;  // SSM 中是 30 分钟
const finalValue = transformValue(ssmValue, varSpec);
// 结果: 1800 秒
export ACCESS_TOKEN_EXPIRE=1800
```

**解决**: SSM 使用"分钟"但应用期望"秒"的不一致问题

---

## 环境配置

### 环境变量

```bash
# 环境选择
export OPTIMA_OPS_ENV=production  # 或 stage, development

# SSH 密钥路径（可选）
export OPTIMA_SSH_KEY=~/.ssh/optima-ec2-key

# AWS 配置
export AWS_REGION=ap-southeast-1
export AWS_PROFILE=optima

# 输出格式
export OPTIMA_OUTPUT=json

# 非交互模式（CI/CD）
export NON_INTERACTIVE=1

# 启用命令计时
export OPTIMA_TIMING=1

# 调试模式（显示错误堆栈）
export DEBUG=1
```

### 配置文件结构

```json
{
  "environment": "production",
  "ec2": {
    "production": {
      "host": "ec2-prod.optima.shop",
      "user": "ec2-user",
      "keyPath": "~/.ssh/optima-ec2-key"
    },
    "stage": { ... },
    "development": { ... }
  },
  "aws": {
    "region": "ap-southeast-1",
    "profile": "default"
  }
}
```

---

## 可用命令（Phase 1-8）

### Monitor 模块（3 命令）⭐ **新增**

```bash
# 启动多面板监控仪表盘（默认）
optima-ops monitor [--env production|stage] [--interval 5]

# 显式启动多面板监控
optima-ops monitor dashboard [--env production|stage] [--interval 5]

# 启动经典单面板监控（精简版）
optima-ops monitor legacy [--env production|stage] [--interval 5]
```

**功能**:
- 实时监控所有服务健康状态（HTTP /health + 容器状态）
- EC2 资源使用（CPU、内存、磁盘）
- Docker 容器资源使用（CPU、内存、网络 I/O）
- 蓝绿部署状态和流量分配
- 构建信息显示（tag、branch、commit、workflow、时间）

**选项**:
- `--env`: 环境选择（production 或 stage，默认 production）
- `--interval`: 刷新间隔（秒，默认 5）

**键盘快捷键** (多面板模式):
- `0-4`: 切换到指定面板（概览、服务、EC2、Docker、蓝绿部署）
- `Tab` / `Shift+Tab`: 循环切换面板
- `r`: 手动刷新当前面板
- `q` / `Esc`: 退出

### Services 模块（5 命令）

```bash
# 健康检查（HTTP /health 端点 + 容器状态）
optima-ops services health [--env prod|stage] [--service <name>] [--type core|mcp|all]

# 容器状态
optima-ops services status [--service <name>] [--type core|mcp|all]

# 容器日志
optima-ops services logs <service> [--tail 100] [--follow]

# 容器详细配置
optima-ops services inspect <service>

# 重启服务
optima-ops services restart <service> [--yes]
```

### Deploy 模块（5 命令）

```bash
# 查看部署历史（自动检测 workflow）
optima-ops deploy status <service> [--limit 10]

# 实时监控部署
optima-ops deploy watch <service> [run-id]

# 列出所有服务部署状态
optima-ops deploy list

# 查看部署日志
optima-ops deploy logs <service> <run-id>

# 触发部署
optima-ops deploy trigger <service> [--mode deploy-only] [--yes]
```

### Database 模块（20 命令）

```bash
# 初始化数据库凭证
optima-ops db init-credentials

# Schema 探索
optima-ops db list
optima-ops db info <database>
optima-ops db tables --database <name>
optima-ops db describe <table> --database <name>
optima-ops db relationships <table> --database <name>
optima-ops db schema-export --database <name>
optima-ops db schema-graph --database <name>

# 健康监控
optima-ops db health --database <name>
optima-ops db connections --database <name>
optima-ops db cache-hit --database <name>
optima-ops db locks --database <name>
optima-ops db slow-queries --database <name>
optima-ops db bloat --database <name>
optima-ops db index-usage --database <name>

# 基础操作
optima-ops db query <sql> --database <name>
optima-ops db sample <table> --database <name>

# 备份管理
optima-ops db dump <database>
optima-ops db backups-list
optima-ops db backups-info <path>
```

**自动化**: SSH 隧道自动建立，SSL 连接，PostgreSQL 17 兼容

### Infrastructure 模块（5 命令）

```bash
# EC2 信息（动态查找实例）
optima-ops infra ec2

# Docker 容器资源
optima-ops infra docker

# 磁盘使用
optima-ops infra disk

# 网络配置（批量优化）
optima-ops infra network

# GitHub Runner 状态
optima-ops infra runner
```

### Logs 模块（4 命令）

```bash
# 日志搜索
optima-ops logs search <pattern> [--service <name>]

# 错误分析
optima-ops logs errors [--service <name>]

# 日志尾部
optima-ops logs tail <service>

# 日志导出
optima-ops logs export <service> [--output <file>]
```

### Config 模块（4 命令）

```bash
# 获取参数值
optima-ops config get <service> <parameter>

# 列出参数
optima-ops config list <service>

# 显示所有参数
optima-ops config show <service>

# 环境对比
optima-ops config compare <service> --from-env <env> --to-env <env>
```

### Validate 模块（4 命令）⭐ 新增

```bash
# 查看配置规范
optima-ops validate spec <service>

# 部署前验证
optima-ops validate pre <service>

# 部署后验证
optima-ops validate post <service>

# 环境差异对比
optima-ops validate diff <service> --from-env <env> --to-env <env>
```

---

## 开发

### 添加新命令

1. 创建命令文件: `src/commands/<module>/<action>.ts`
2. 遵循模式:

```typescript
import { Command } from 'commander';
import { handleError } from '../../utils/error.js';
import { isJsonOutput, outputSuccess } from '../../utils/output.js';
import { CommandTimer, isTimingEnabled } from '../../utils/timer.js';

export const myCommand = new Command('my-command')
  .description('命令描述')
  .option('--env <env>', '环境')
  .option('--json', 'JSON 输出')
  .action(async (options) => {
    try {
      const timer = new CommandTimer();

      // 实现逻辑
      timer.step('步骤1');

      if (isJsonOutput()) {
        outputSuccess({
          ...data,
          _timing: isTimingEnabled() ? timer.getTimingData() : undefined,
        });
      } else {
        // 人类可读输出
        if (isTimingEnabled()) {
          timer.printSummary();
        }
      }
    } catch (error) {
      handleError(error);
    }
  });
```

3. 导出: `src/commands/<module>/index.ts`
4. 注册: `src/index.ts`

### TypeScript ES Modules

**关键**: 导入时必须使用 `.js` 扩展名（即使文件是 `.ts`）:

```typescript
// ✅ 正确
import { SSHClient } from '../../utils/ssh.js';

// ❌ 错误
import { SSHClient } from '../../utils/ssh';
```

### 本地测试

```bash
# 使用 dev runner
npm run dev -- services health

# 测试验证功能
npm run dev -- validate pre user-auth
npm run dev -- validate post user-auth
npm run dev -- validate spec user-auth
```

---

## SSH 安全

### 命令验证

所有 SSH 命令通过 `validateCommand()` 验证:

```typescript
const validation = validateCommand(command);
if (!validation.safe) {
  throw new CommandExecutionError(`命令被安全策略阻止: ${validation.reason}`);
}
```

### 白名单详情

**只读命令**（允许）:
```
docker ps, docker logs, docker inspect, docker stats, docker exec, docker network, docker images
ip, df -h, free -h, cat, grep, ls, find, tail, head, echo, pwd, whoami, uptime, date, wc
systemctl status, journalctl
```

**低风险命令**（需确认）:
```
docker restart, docker-compose restart, systemctl restart
```

**危险命令**（禁止）:
```
rm, docker rm, docker system prune, kill, shutdown, reboot
Shell 操作符: >, >>, | (引号外), ;, &&, ||
```

**特殊处理**: 允许引号内的管道符（如 docker stats --format "..."）

---

## AWS 集成

### 必需的 IAM 权限

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ssm:GetParameter",
        "ssm:GetParametersByPath",
        "secretsmanager:GetSecretValue",
        "ec2:DescribeInstances",
        "ec2:DescribeInstanceStatus",
        "rds:DescribeDBInstances",
        "logs:DescribeLogGroups",
        "logs:FilterLogEvents",
        "s3:GetObject"
      ],
      "Resource": "*"
    }
  ]
}
```

### SSH 密钥设置

```bash
# 从 Parameter Store 获取（首次）
aws ssm get-parameter \
  --name /optima/ec2/ssh-private-key \
  --with-decryption \
  --query Parameter.Value \
  --output text > ~/.ssh/optima-ec2-key

chmod 600 ~/.ssh/optima-ec2-key

# 测试连接
ssh -i ~/.ssh/optima-ec2-key ec2-user@ec2-prod.optima.shop
```

---

## GitHub CLI 集成

### 必需设置

```bash
# 安装
brew install gh

# 认证
gh auth login

# 测试
gh run list --repo Optima-Chat/user-auth --limit 5
```

### 支持的操作

- 列出 workflow runs: `getWorkflowRuns(repo, options)`
- 查看 run 详情: `getRunDetails(repo, runId)`
- 获取 run jobs: `getRunJobs(repo, runId)`
- 监控 run: `watchRun(repo, runId)`
- 触发 workflow: `triggerWorkflow(repo, workflow, inputs)`
- **自动检测 workflow**: `getDeployWorkflow(repo)` ⭐

---

## 错误处理

### 自定义错误类

- `OpsCLIError` - 基础错误
- `SSHConnectionError` - SSH 连接失败
- `AWSError` - AWS SDK 错误
- `ConfigurationError` - 配置文件问题
- `CommandExecutionError` - 命令执行失败
- `ValidationError` - 输入验证错误
- `DatabaseError` - 数据库错误

### 错误输出格式

**人类可读**:
```
✗ 错误: SSH 连接失败

堆栈:  # DEBUG=1 时显示
  at SSHClient.connect (...)

详细信息:
  { "host": "ec2-prod.optima.shop", "error": "Connection timeout" }

提示: 请检查 SSH 密钥和网络连接
```

**JSON**:
```json
{
  "success": false,
  "error": {
    "code": "SSH_CONNECTION_ERROR",
    "message": "无法连接到 ec2-prod.optima.shop",
    "details": { ... }
  }
}
```

---

## 常见问题

**SSH 连接失败**:
- 检查密钥: `ls -la ~/.ssh/optima-ec2-key`
- 检查权限: `chmod 600 ~/.ssh/optima-ec2-key`
- 测试连接: `ssh -i ~/.ssh/optima-ec2-key ec2-user@ec2-prod.optima.shop`

**AWS 权限错误**:
- 验证 IAM 权限
- 检查: `aws sts get-caller-identity`
- 设置 profile: `export AWS_PROFILE=optima`

**GitHub CLI 未找到**:
- 安装: `brew install gh`
- 认证: `gh auth login`

**命令被白名单阻止**:
- 查看允许的命令: `utils/ssh.ts`
- 危险命令被故意阻止以保证安全

**validate post 显示很多缺失**:
- 查看 config-spec.yaml 中的 `usage_stages`
- 构建时变量（NEXT_PUBLIC_*）在容器中缺失是正常的
- 部署参数化变量（DEPLOY_ENV）不需要传入容器

**tsc 编译卡住**:
- WSL 环境已知问题
- 使用 `npm run dev` 代替 `npm run build`

---

## 相关项目

- **optima-cli**: 主 CLI，电商操作（产品、订单等）
- **optima-terraform**: 基础设施即代码（EC2, RDS, ALB 配置）
- **services**: 后端服务（user-auth, mcp-host, commerce-backend, agentic-chat）
- **mcp-servers**: MCP 服务器（6 个）

---

## 贡献指南

添加新功能时：

1. **保持只读焦点**: 避免破坏性操作
2. **添加 SSH 白名单条目**: 如果需要新命令
3. **支持双输出格式**: 人类可读和 JSON
4. **添加交互式提示**: 缺失参数自动提示
5. **优雅的错误处理**: 使用自定义错误类
6. **更新文档**: README.md 和 CLAUDE.md
7. **添加计时**: 使用 CommandTimer
8. **config-spec.yaml**: 新服务需创建配置规范

---

## 性能优化最佳实践

### 1. 批量 SSH 调用

```typescript
// ❌ 不好：N 次 SSH 调用
for (const iface of interfaces) {
  await ssh.executeCommand(`ip link show ${iface}`);
}

// ✅ 好：1 次 SSH 调用
const result = await ssh.executeCommand('ip link show');
const blocks = result.stdout.split(/\n(?=\d+:)/);
// 本地解析所有接口
```

### 2. 添加计时追踪

```typescript
const timer = new CommandTimer();

await loadConfig();
timer.step('加载配置');

await processData();
timer.step('处理数据');

if (isTimingEnabled()) {
  timer.printSummary();  // 显示各步骤耗时
}
```

### 3. 使用配置缓存

```typescript
let cachedServicesConfig: ServicesConfigFile | null = null;

function loadServicesConfig(): ServicesConfigFile {
  if (cachedServicesConfig) {
    return cachedServicesConfig;  // 避免重复读取文件
  }
  // 加载并缓存
}
```

---

## 链接

- [设计文档](../../notes-private/projects/Optima Ops CLI 设计方案.md)
- [主项目文档](../../CLAUDE.md)
- [Optima Terraform](../../infrastructure/optima-terraform/CLAUDE.md)
- [测试问题汇总](../../notes-private/notes/optima-ops-cli-测试问题汇总.md)
- [项目总结](../../notes-private/plans/done/optima-ops-cli-project-summary.md)

---

**最后更新**: 2025-11-20
**状态**: ✅ 生产就绪
