# Optima Ops CLI - 运维监控工具

> **Optima 基础设施的运维监控命令行工具**

一个专为 Optima 基础设施设计的 DevOps 和 SRE 工具，采用**只读优先**的安全设计理念。

## 核心特性

- 🏥 **服务健康监控** - HTTP 端点检查 + Docker 容器状态（10 个服务全覆盖）
- 🚀 **部署追踪** - GitHub Actions 集成，查看部署历史（自动检测 workflow）
- 🗄️ **数据库管理** - Schema 探索、健康监控、备份管理（自动 SSH 隧道）
- 🖥️ **基础设施监控** - EC2 资源、Docker 容器、磁盘、网络（动态查找实例）
- 📝 **日志分析** - 容器日志搜索、错误聚合、实时跟踪、日志导出
- ⚙️ **配置管理** - AWS Parameter Store 参数查看、脱敏、环境对比
- ✅ **部署验证** - 配置完整性验证、环境变量对比、部署前后验证
- 🔒 **安全优先** - SSH 命令白名单、只读事务、敏感数据自动脱敏
- ⚡ **性能优化** - 命令计时系统、批量 SSH 调用优化

## 快速开始

### 安装

```bash
git clone https://github.com/Optima-Chat/optima-ops-cli.git
cd optima-ops-cli
npm install
npm link
```

### 前置条件

1. **SSH 密钥** - 从 AWS Parameter Store 获取：
   ```bash
   aws ssm get-parameter --name /optima/ec2/ssh-private-key --with-decryption --query Parameter.Value --output text > ~/.ssh/optima-ec2-key
   chmod 600 ~/.ssh/optima-ec2-key
   ```

2. **AWS CLI** - 配置好权限
   ```bash
   aws configure
   ```

3. **数据库凭证** - 首次运行初始化：
   ```bash
   optima-ops db init-credentials
   ```
   此命令会自动从 AWS Secrets Manager 和 Terraform State 获取所有数据库密码，并保存到本地配置文件（已加入 .gitignore）

4. **GitHub CLI**（可选，用于部署命令）：
   ```bash
   brew install gh
   gh auth login
   ```

### 基本使用

```bash
# 查看当前环境配置
optima-ops env

# 检查所有服务健康状态（核心 4 + MCP 6）
optima-ops services health

# 只查看 MCP 服务
optima-ops services health --type mcp

# 查看部署历史（自动检测 workflow 文件）
optima-ops deploy status user-auth

# 数据库操作（自动通过 SSH 隧道连接私有 RDS）
optima-ops db list
optima-ops db info optima_auth
optima-ops db tables --database optima_auth

# 部署验证（基于 config-spec.yaml）
optima-ops validate pre user-auth      # 部署前验证
optima-ops validate post user-auth     # 部署后验证
optima-ops validate spec user-auth     # 查看配置规范

# JSON 输出（适合脚本）
optima-ops services health --json

# 性能分析（启用计时）
export OPTIMA_TIMING=1
optima-ops infra network
```

## 可用命令

### Monitor 实时监控仪表盘 ⭐ **新功能**

**多面板 TUI 监控仪表盘**，实时查看系统、服务、容器状态。

```bash
# 启动多面板监控仪表盘（默认）
optima-ops monitor [--env production|stage] [--interval 5]

# 显式启动多面板
optima-ops monitor dashboard [--env production|stage] [--interval 5]

# 启动经典单面板（精简版）
optima-ops monitor legacy [--env production|stage] [--interval 5]
```

**多面板 Dashboard 功能**（5个面板）:
- **Panel 0: 概览** - 系统整体健康状态（服务、EC2、Docker综合视图）
- **Panel 1: 服务健康** - 所有服务详细健康状态（HTTP端点 + 容器状态 + 版本信息）
- **Panel 2: EC2 资源** - EC2 实例资源使用（CPU、内存、磁盘、运行时间）
- **Panel 3: Docker 容器** - Docker 容器资源使用（CPU、内存、版本/分支、运行时长）
- **Panel 4: 蓝绿部署** - 蓝绿部署状态和流量分配

**键盘导航**:
- `0-4`: 直接切换到指定面板
- `Tab` / `Shift+Tab`: 循环切换面板
- `r`: 手动刷新当前面板
- `q` / `Esc`: 退出

**特性**:
- ✅ 实时自动刷新（可配置间隔）
- ✅ SSH 连接池优化（复用连接，减少开销）
- ✅ 内存优化（使用 Buffer.concat 代替字符串拼接）
- ✅ 后台数据刷新（不阻塞 UI）
- ✅ 完整的构建信息显示（tag、branch、commit、workflow、时间）

---

### Services 服务管理（5个命令）

```bash
# 健康检查 - HTTP 端点 + 容器状态
optima-ops services health [--env prod|stage|dev] [--service <name>] [--type core|mcp|all] [--json]

# 容器状态 - 运行时间、CPU、内存使用
optima-ops services status [--env prod|stage|dev] [--service <name>] [--type core|mcp|all] [--json]

# 容器日志 - 支持 tail、follow、since
optima-ops services logs [service] [--env prod|stage|dev] [--tail 100] [--follow] [--since 10m]

# 容器配置 - 网络、端口、挂载、环境变量
optima-ops services inspect [service] [--env prod|stage|dev] [--json]

# 重启服务 - 需要确认或 --yes
optima-ops services restart [service] [--env prod|stage|dev] [--yes]
```

**支持的服务**（10 个，100% 覆盖）:
- **核心服务**: user-auth, mcp-host, commerce-backend, agentic-chat
- **MCP 服务**: comfy-mcp, fetch-mcp, perplexity-mcp, shopify-mcp, commerce-mcp, google-ads-mcp

---

### Deploy 部署管理（5个命令）

```bash
# 查看部署历史 - 自动检测 workflow 文件名
optima-ops deploy status <service> [--env prod|stage|dev] [--limit 10] [--json]

# 实时监控部署 - 跟踪部署进度
optima-ops deploy watch <service> [run-id] [--env prod|stage|dev]

# 列出所有服务 - 汇总部署状态
optima-ops deploy list [--env prod|stage|dev] [--limit 3] [--json]

# 查看部署日志 - 完整 GitHub Actions 日志
optima-ops deploy logs <service> [run-id] [--env prod|stage|dev]

# 触发部署 - 需要确认或 --yes
optima-ops deploy trigger <service> [--env prod|stage|dev] [--mode deploy-only|build-deploy] [--yes]
```

**自动适配**:
- 自动检测每个仓库的 workflow 文件名（deploy-aws-prod.yml, deploy-unified.yml 等）
- 适配未来 workflow 文件变更

---

### Database 数据库管理（20个命令）

#### 初始化

```bash
# 首次运行：从 AWS Secrets Manager 和 Terraform State 获取密码
optima-ops db init-credentials [--force]
```

#### Schema 探索（7个命令）

```bash
# 列出所有数据库
optima-ops db list [--env prod|stage|dev] [--json]

# 显示数据库详情（大小、表数量、活跃连接）
optima-ops db info [database] [--env prod|stage|dev] [--json]

# 列出数据库中的所有表
optima-ops db tables [--database <name>] [--env prod|stage|dev] [--json]

# 显示表结构（列、索引、外键）
optima-ops db describe [table] [--database <name>] [--env prod|stage|dev] [--json]

# 显示表的外键关系
optima-ops db relationships [table] [--database <name>] [--env prod|stage|dev] [--json]

# 导出数据库 schema（不含数据）
optima-ops db schema-export [--database <name>] [--env prod|stage|dev] [--output schema.sql]

# 生成数据库关系图（JSON 或 Mermaid ER 图）
optima-ops db schema-graph [--database <name>] [--env prod|stage|dev] [--format json|mermaid]
```

#### Health Monitoring 健康监控（8个命令）

```bash
# 数据库综合健康检查
optima-ops db health [--database <name>] [--env prod|stage|dev] [--json]

# 显示数据库连接详情
optima-ops db connections [--database <name>] [--env prod|stage|dev] [--json]

# 显示缓存命中率（整体或按表）
optima-ops db cache-hit [--database <name>] [--env prod|stage|dev] [--by-table] [--json]

# 显示数据库锁和阻塞情况
optima-ops db locks [--database <name>] [--env prod|stage|dev] [--show-blocking] [--json]

# 显示正在运行的慢查询
optima-ops db slow-queries [--database <name>] [--env prod|stage|dev] [--threshold 5] [--json]

# 显示表膨胀情况（死元组）
optima-ops db bloat [--database <name>] [--env prod|stage|dev] [--threshold 20] [--json]

# 显示索引使用统计
optima-ops db index-usage [--database <name>] [--env prod|stage|dev] [--show-unused] [--json]
```

#### 基础操作（2个命令）

```bash
# 执行只读 SQL 查询（强制 READ ONLY 事务）
optima-ops db query [sql] [--database <name>] [--env prod|stage|dev] [--json]

# 安全采样表数据（使用 TABLESAMPLE）
optima-ops db sample [table] [--database <name>] [--env prod|stage|dev] [--limit 100] [--json]
```

#### Backup & Dump 备份管理（3个命令）

```bash
# 备份数据库（pg_dump 最佳实践：目录格式、并行、压缩）
optima-ops db dump [database] [--env prod|stage|dev] [--output /opt/backups] [--parallel 4] [--compress zstd:9] [--yes]

# 列出 EC2 上的数据库备份
optima-ops db backups-list [--env prod|stage|dev] [--limit 20] [--json]

# 显示备份详情（大小、文件数、创建时间）
optima-ops db backups-info <backup-path> [--env prod|stage|dev] [--json]
```

**自动化特性**:
- ✅ 自动建立 SSH 隧道到私有 RDS（10.0.10.221:5432）
- ✅ 自动管理隧道生命周期（连接/断开）
- ✅ 支持 SSL 连接
- ✅ 兼容 PostgreSQL 17

---

### Infrastructure 基础设施监控（5个命令）

```bash
# EC2 实例信息和资源使用（动态查找实例）
optima-ops infra ec2 [--env prod|stage|dev] [--json]
# 显示: 实例信息、CPU/内存/负载、磁盘使用、网络接口

# Docker 容器资源使用情况
optima-ops infra docker [--env prod|stage|dev] [--json]
# 显示: 容器统计（CPU%、内存、网络I/O、磁盘I/O）

# 磁盘使用情况和清理建议
optima-ops infra disk [--env prod|stage|dev] [--details] [--json]
# 显示: 文件系统、Docker数据使用、大目录、清理建议

# Docker 网络配置和容器网络（批量优化，5秒完成）
optima-ops infra network [--env prod|stage|dev] [--json]
# 显示: 主机网络接口、Docker 网络、容器网络和端口映射

# GitHub Actions Runner 状态
optima-ops infra runner [--env prod|stage|dev] [--logs 20] [--json]
# 显示: Runner 状态、服务信息、最近任务、日志
```

**自动化特性**:
- ✅ 通过 EC2 标签动态查找实例（避免硬编码 instance ID）
- ✅ 批量 SSH 调用优化（network 命令 83% 性能提升）

---

### Logs 日志分析（4个命令）

```bash
# 搜索日志中的关键词（支持正则表达式）
optima-ops logs search [pattern] [--env prod|stage|dev] [--service <name>] [--since 1h] [--context 3] [--case-sensitive] [--json]

# 查看错误日志并聚合分析
optima-ops logs errors [--env prod|stage|dev] [--service <name>] [--since 1h] [--level error|critical|warning] [--aggregate] [--json]

# 查看容器日志尾部（实时或历史）
optima-ops logs tail [service] [--env prod|stage|dev] [--tail 100] [--follow] [--since 1h] [--json]

# 导出容器日志到本地文件
optima-ops logs export [service] [--env prod|stage|dev] [--output <file>] [--since 24h] [--tail <lines>] [--format text|json] [--json]
```

---

### Config 配置管理（4个命令）

```bash
# 获取单个配置参数值（自动脱敏）
optima-ops config get <service> <parameter> [--env prod|stage|dev] [--raw] [--json]

# 列出服务的所有配置参数（不显示值）
optima-ops config list <service> [--env prod|stage|dev] [--json]

# 显示服务的所有配置参数（值已脱敏）
optima-ops config show <service> [--env prod|stage|dev] [--raw] [--json]

# 对比两个环境的配置差异
optima-ops config compare <service> --from-env <env> --to-env <env> [--json]
```

---

### Validate 部署验证（4个命令）⭐ **新功能**

```bash
# 查看服务配置规范（基于 config-spec.yaml）
optima-ops validate spec <service> [--json]
# 显示: 所有环境变量定义、必需参数、已废弃参数、配置源

# 部署前验证配置完整性
optima-ops validate pre <service> [--env prod|stage|dev] [--json]
# 验证: SSM/Infisical 中配置是否完整、格式是否正确

# 部署后验证容器实际环境变量
optima-ops validate post <service> [--env prod|stage|dev] [--show-values] [--json]
# 验证: 容器中实际环境变量与期望值是否一致

# 对比两个环境的配置差异（智能分析）
optima-ops validate diff <service> --from-env <env> --to-env <env> [--show-values] [--json]
# 智能区分: 问题（应该相同但不同）vs 正常差异（环境特定参数）
```

**config-spec.yaml 设计**:
- 定义所有环境变量的元数据（类型、格式、是否必需）
- 使用阶段标记（build_time / deploy_script / container_runtime）
- SSM 参数映射和转换（分钟→秒等）
- 已废弃参数文档
- 环境特定验证规则

**验证策略**:
- 理解构建时变量（NEXT_PUBLIC_*）在容器中不可见是正常的
- 理解部署参数化变量（DEPLOY_ENV 等）不需要传入容器
- 智能判断哪些参数缺失是问题，哪些是设计如此

---

### 工具命令

```bash
# 显示环境配置
optima-ops env

# 显示版本信息（支持 --json）
optima-ops version
```

---

## 设计理念

### 1. 配置驱动架构

**服务配置** (`services-config.json`):
- 定义所有 10 个服务的元数据
- 包含 repo、容器名、健康端点、类型等
- 新增服务只需添加一条配置，所有命令自动支持

**配置规范** (`config-spec.yaml`，每个服务仓库):
- 定义该服务所有环境变量的 schema
- 作为配置管理的唯一真相源
- 支持自动化验证和迁移

### 2. 完全自动化

- ✅ **数据库密码**: 自动从 Secrets Manager/SSM/Terraform State 获取并缓存
- ✅ **SSH 隧道**: 自动建立到私有 RDS，无需手动操作
- ✅ **EC2 实例**: 通过 Name 标签动态查找，适配实例重建
- ✅ **Workflow 文件**: 自动检测 deploy-aws-prod.yml / deploy-unified.yml 等
- ✅ **配置转换**: 自动处理 SSM 参数命名和单位差异

### 3. 只读优先设计

- **93% 只读命令** - 纯观察，无副作用
- **7% 低风险命令** - 重启、触发部署（需 `--yes` 确认）
- **0% 危险命令** - 删除、清理、任意 SQL（已阻止）

**SSH 命令白名单**:
- ✅ 允许: `docker ps`, `docker logs`, `docker inspect`, `docker exec env`, `cat`, `grep`, `ls`
- ⚠️ 需确认: `docker restart`, `systemctl restart`
- ❌ 禁止: `rm`, `docker rm`, `kill`, `shutdown`, 管道符 `|`, 重定向 `>`

### 4. 性能优化

**批量 SSH 调用**:
- infra network: 从 N+M 次调用优化为 3 次 → 性能提升 83%
- 原理: 一次性获取所有数据，本地解析

**命令计时系统**:
```bash
export OPTIMA_TIMING=1
optima-ops deploy status user-auth

⏱️  执行时间:
  检测 workflow: 1.68s
  获取部署历史: 2.09s
  总计: 3.94s
```

---

## 环境管理

### 支持的环境

| 环境 | EC2 主机 | 配置源 | 服务列表 |
|------|---------|--------|---------|
| **production** | ec2-prod.optima.shop | AWS SSM | 10 个服务 |
| **stage** | ec2-stage.optima.shop | Infisical | 10 个服务 |
| **development** | ec2-dev.optima.shop | - | 10 个服务 |

### 环境变量

```bash
# 设置环境
export OPTIMA_OPS_ENV=production  # 或 stage, development

# 自定义 SSH 密钥路径
export OPTIMA_SSH_KEY=~/.ssh/custom-key

# AWS 配置
export AWS_REGION=ap-southeast-1
export AWS_PROFILE=optima

# JSON 输出
export OPTIMA_OUTPUT=json

# 非交互模式（CI/CD）
export NON_INTERACTIVE=1

# 启用命令计时
export OPTIMA_TIMING=1

# 调试模式（显示错误堆栈）
export DEBUG=1
```

---

## 核心技术

### 自动 SSH 隧道

连接私有 RDS（10.0.10.221:5432）：

```typescript
class SSHTunnel {
  async connect(): Promise<number> {
    // 1. 建立 SSH 连接到 EC2
    // 2. 创建本地端口转发到 RDS
    // 3. 返回本地端口
  }
}

class DatabaseClient {
  async connect(): Promise<void> {
    // 自动建立隧道
    this.tunnel = new SSHTunnel(this.env);
    const localPort = await this.tunnel.connect();

    // 连接到 localhost:localPort
    // PostgreSQL 通过隧道连接到私有 RDS
  }
}
```

### 动态资源查找

通过标签查找 EC2 实例：

```typescript
async function findEC2InstanceByEnvironment(env: string): Promise<string> {
  // 环境 → 实例名称映射
  const nameMap = {
    production: 'optima-prod-host',
    stage: 'optima-stage-host',
  };

  // 通过 tag:Name 查找运行中的实例
  const instances = await ec2.describeInstances({
    Filters: [
      { Name: 'tag:Name', Values: [nameMap[env]] },
      { Name: 'instance-state-name', Values: ['running'] },
    ],
  });

  return instances[0].InstanceId;  // 动态返回实际 ID
}
```

### Workflow 自动检测

```typescript
async function getDeployWorkflow(repo: string): Promise<string> {
  // 1. 通过 GitHub API 获取仓库的所有 workflows
  // 2. 过滤包含 "deploy" 的文件
  // 3. 优先级匹配:
  //    - deploy-aws-prod.yml
  //    - deploy-unified.yml
  //    - deploy.yml
  // 4. 返回找到的 workflow 文件名
}
```

### 配置规范驱动验证

```typescript
// 1. 加载 config-spec.yaml
const spec = loadConfigSpec('/path/to/service');

// 2. 从 SSM 加载实际配置
const ssmConfig = await SSMConfigLoader.load();

// 3. 应用转换（如果有）
for (const [varName, varSpec] of Object.entries(spec.variables)) {
  if (varSpec.transform) {
    const ssmValue = ssmConfig[varSpec.ssm_param];
    ssmConfig[varName] = transformValue(ssmValue, varSpec);
  }
}

// 4. 验证（使用 Zod）
const result = schema.safeParse(ssmConfig);

// 5. 分析缺失（考虑使用阶段）
for (const missing of missingVars) {
  const varSpec = spec.variables[missing];
  if (varSpec.build_time || varSpec.container_path) {
    continue;  // 正常缺失
  }
  reportError(missing);  // 真正的问题
}
```

---

## 安全特性

### 敏感数据脱敏

自动混淆：
- 密码 (`password=***`)
- Token (`token=***`)
- 连接字符串 (`user:***@host`)
- AWS 密钥 (`AKIA***`)

```bash
# 默认脱敏
optima-ops validate post user-auth
DATABASE_URL: *** → ***

# 显示实际值（谨慎使用）
optima-ops validate post user-auth --show-values
DATABASE_URL: postgresql://auth_user:17fd... → postgresql://auth_user:17fd...
```

### 数据库强制只读

```typescript
async query(sql: string): Promise<QueryResult> {
  // 强制 READ ONLY 事务
  await this.client.query('BEGIN TRANSACTION READ ONLY');
  const result = await this.client.query(sql);
  await this.client.query('COMMIT');
  return result;
}
```

---

## 输出格式

### 人类可读（默认）

彩色表格和格式化文本：
```
🏥 服务健康检查 - production 环境

检查 user-auth... ✓ 健康 (488ms)
检查 mcp-host... ✓ 健康 (385ms)

总结:
  ✓ 所有服务健康 (10/10)
```

### JSON 格式

```bash
optima-ops services health --json
```

```json
{
  "success": true,
  "data": {
    "environment": "production",
    "services": [
      {
        "service": "user-auth",
        "type": "core",
        "status": "healthy",
        "response_time": "120ms"
      }
    ],
    "summary": {
      "total": 10,
      "healthy": 9,
      "unhealthy": 1
    }
  }
}
```

---

## 开发

### 本地开发

```bash
# 安装依赖
npm install

# 开发模式（使用 tsx，无需构建）
npm run dev -- services health
npm run dev -- validate pre user-auth

# 代码检查
npm run lint

# 运行测试（104 个单元测试）
npm test
```

**注**: 由于 WSL 环境 tsc 编译问题，推荐使用 `npm run dev` 直接运行 TypeScript。

### 添加新服务

只需在 `services-config.json` 添加一条：

```json
{
  "name": "new-service",
  "repo": "Optima-Chat/new-service",
  "container": "optima-new-service-prod",
  "healthEndpoint": "https://new.optima.shop/health",
  "type": "core",
  "hasDatabase": true,
  "hasRedis": false
}
```

所有命令自动支持新服务！

### 添加新服务的配置验证

1. 在服务仓库创建 `config-spec.yaml`
2. 定义所有环境变量
3. 运行 `optima-ops validate spec <service>` 验证

---

## 实现路线

### ✅ Phase 1-5 完成 (2025-11-14)
- [x] Services + Deploy 模块（10 个命令）
- [x] Database 模块（20 个命令）
- [x] Infrastructure 模块（5 个命令）
- [x] Logs 模块（4 个命令）
- [x] Config 模块（4 个命令）
- [x] 单元测试（104 个测试）

### ✅ Phase 6 优化 (2025-11-14 晚 ~ 2025-11-15)
- [x] 数据库密码管理 + SSH 隧道自动连接
- [x] GitHub CLI 字段兼容 + SSH 白名单扩展
- [x] 命令计时系统 + workflow 自动检测
- [x] EC2 动态查找 + db SQL 兼容性修复
- [x] MCP Servers 监控集成（服务覆盖率 100%）

### ✅ Phase 7 部署验证 (2025-11-15)
- [x] 部署验证系统 Phase 1
  - [x] config-spec.yaml 规范格式
  - [x] ConfigLoader（SSM + Container）
  - [x] validate spec / pre / post / diff 命令
  - [x] 使用阶段区分设计
  - [x] SSM 参数映射和转换

---

## 性能表现

| 命令 | 优化前 | 优化后 | 说明 |
|------|--------|--------|------|
| infra network | >30s (超时) | ~5s | 批量 SSH 调用 |
| db list | 失败 | ~2s | SSH 隧道 + 密码管理 |
| deploy status | 失败 | ~4s | workflow 自动检测 |
| infra ec2 | 失败 | ~3.4s | 动态实例查找 |
| validate pre | - | ~1.2s | 配置加载 + Zod 验证 |
| validate post | - | ~2.9s | SSH + 容器环境变量读取 |

---

## 常见问题

**数据库连接失败**:
- 确保已运行 `optima-ops db init-credentials`
- RDS 在私有子网，工具会自动建立 SSH 隧道

**EC2 实例未找到**:
- 工具通过 Name 标签查找实例
- 确保实例标签正确：optima-prod-host, optima-stage-host

**Workflow 未找到**:
- 工具自动检测包含 "deploy" 的 workflow 文件
- 支持 deploy-aws-prod.yml, deploy-unified.yml, deploy.yml 等

**validate post 显示很多缺失**:
- 检查缺失的参数是否标记为 `build_time` 或在 `deprecated` 列表
- 构建时变量和已废弃参数在容器中缺失是正常的

---

## 统计

**开发周期**: 2.5 天
**总 Commits**: 10 个
**代码行数**: ~3500 行
**单元测试**: 104 个
**模块数**: 7 个
**命令数**: 47 个
**服务覆盖**: 10/10 (100%)
**修复问题**: 9 个

---

## 相关文档

- [CLAUDE.md](./CLAUDE.md) - 开发者详细文档
- [设计文档](../../notes-private/projects/Optima%20Ops%20CLI%20设计方案.md)
- [主项目 README](../../CLAUDE.md)
- [测试问题汇总](../../notes-private/notes/optima-ops-cli-测试问题汇总.md)
- [项目总结](../../notes-private/plans/done/optima-ops-cli-project-summary.md)

---

## License

MIT

---

**Status**: ✅ Production Ready

**Last Updated**: 2025-11-15
