# Optima Ops CLI - 运维监控工具

> **Optima 基础设施的运维监控命令行工具**

一个专为 Optima 基础设施设计的 DevOps 和 SRE 工具，采用**只读优先**的安全设计理念。

## 核心特性

- 🏥 **服务健康监控** - HTTP 端点检查 + Docker 容器状态
- 🚀 **部署追踪** - GitHub Actions 集成，查看部署历史
- 🗄️ **数据库管理** - Schema 探索、健康监控、备份管理 ✅
- 🖥️ **基础设施监控** - EC2、RDS、ALB 监控（即将推出）
- 📝 **日志分析** - CloudWatch Logs 搜索（即将推出）
- 🔒 **安全优先** - SSH 命令白名单、只读事务

## 快速开始

### 安装

```bash
git clone https://github.com/Optima-Chat/optima-ops-cli.git
cd optima-ops-cli
npm install
npm run build
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

3. **GitHub CLI**（可选，用于部署命令）：
   ```bash
   brew install gh
   gh auth login
   ```

### 基本使用

```bash
# 查看当前环境配置
optima-ops env

# 检查所有服务健康状态
optima-ops services health

# 检查特定服务
optima-ops services health --service user-auth

# 切换环境
optima-ops services health --env stage

# 查看部署历史
optima-ops deploy status user-auth

# 数据库健康检查
optima-ops db health

# 列出所有数据库
optima-ops db list

# JSON 输出（适合脚本）
optima-ops services health --json
```

## 可用命令

### Phase 1 - Services 服务管理（5个命令）✅

```bash
# 健康检查 - HTTP 端点 + 容器状态
optima-ops services health [--env prod|stage|dev] [--service <name>] [--json]

# 容器状态 - 运行时间、CPU、内存使用
optima-ops services status [--env prod|stage|dev] [--service <name>] [--json]

# 容器日志 - 支持 tail、follow、since
optima-ops services logs [service] [--env prod|stage|dev] [--tail 100] [--follow] [--since 10m]

# 容器配置 - 网络、端口、挂载、环境变量
optima-ops services inspect [service] [--env prod|stage|dev] [--json]

# 重启服务 - 需要确认或 --yes
optima-ops services restart [service] [--env prod|stage|dev] [--yes]
```

### Phase 1 - Deploy 部署管理（5个命令）✅

```bash
# 查看部署历史 - GitHub Actions 运行记录
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

### Phase 2 - Database 数据库管理（19个命令）✅

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

### 工具命令

```bash
# 显示环境配置
optima-ops env

# 显示版本信息
optima-ops version
```

### 即将推出的模块

- **Infrastructure 模块** - EC2、RDS、ALB 指标
- **Logs 模块** - CloudWatch 日志搜索
- **Config 模块** - 环境变量管理

## 环境管理

### 支持的环境

| 环境 | EC2 主机 | 服务列表 |
|------|---------|---------|
| **production** | ec2-prod.optima.shop | user-auth, mcp-host, commerce-backend, agentic-chat |
| **stage** | ec2-stage.optima.shop | user-auth, mcp-host, commerce-backend, agentic-chat |
| **development** | ec2-dev.optima.shop | user-auth, mcp-host, commerce-backend, agentic-chat |

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
```

## 安全特性

### 只读优先设计

- **93% 只读命令** - 纯观察，无副作用
- **7% 低风险命令** - 重启、触发部署（需 `--yes` 确认）
- **0% 危险命令** - 删除、清理、任意 SQL（已阻止）

### SSH 命令白名单

**允许（只读）**：
- `docker ps`, `docker logs`, `docker inspect`
- `cat`, `grep`, `tail`, `ls`, `find`
- `df -h`, `systemctl status`

**低风险（需确认）**：
- `docker-compose restart`
- `systemctl restart`

**禁止（危险）**：
- `rm`, `docker rm`, `kill`, `shutdown`
- Shell 操作符：`>`, `|`, `;`, `&&`

### 敏感数据脱敏

自动混淆：
- 密码 (`password=***`)
- Token (`token=***`)
- 连接字符串 (`user:***@host`)
- AWS 密钥 (`AKIA***`)

## 输出格式

### 人类可读（默认）

彩色表格和格式化文本

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
        "status": "healthy",
        "response_time": "120ms"
      }
    ]
  }
}
```

## 开发

```bash
# 安装依赖
npm install

# 构建
npm run build

# 开发模式
npm run dev -- services health

# 代码检查
npm run lint
```

## 实现路线

- [x] **Phase 1 完成** (2025-01-13)：Services + Deploy 模块
  - [x] 核心工具类（config, output, error, prompt, ssh）
  - [x] SSH 客户端（命令白名单）
  - [x] AWS SDK 客户端（SSM, EC2, RDS, CloudWatch Logs）
  - [x] GitHub CLI 包装器
  - [x] Services 模块 5 个命令（health, status, logs, inspect, restart）
  - [x] Deploy 模块 5 个命令（status, watch, list, logs, trigger）
  - [x] 工具命令（env, version）

- [x] **Phase 2 完成** (2025-01-13)：Database 模块
  - [x] PostgreSQL 客户端（连接管理、只读事务强制）
  - [x] 密码管理（AWS Parameter Store 集成）
  - [x] 健康监控查询模板（45+ 预定义查询）
  - [x] Schema 探索 7 个命令（list, info, tables, describe, relationships, schema-export, schema-graph）
  - [x] Health Monitoring 8 个命令（health, connections, cache-hit, locks, slow-queries, bloat, index-usage）
  - [x] 基础操作 2 个命令（query, sample）
  - [x] Backup & Dump 3 个命令（dump, backups-list, backups-info）

- [ ] **Phase 3**: Infrastructure 模块（EC2/RDS/ALB 监控）
- [ ] **Phase 4**: Logs 模块（CloudWatch 搜索）
- [ ] **Phase 5**: Config 模块（环境变量管理）

## 常见问题

**SSH 连接失败**：
```bash
ls -la ~/.ssh/optima-ec2-key
chmod 600 ~/.ssh/optima-ec2-key
ssh -i ~/.ssh/optima-ec2-key ec2-user@ec2-prod.optima.shop
```

**AWS 权限错误**：
```bash
aws sts get-caller-identity
export AWS_PROFILE=optima
```

**GitHub CLI 未安装**：
```bash
brew install gh  # macOS
gh auth login
```

## 相关文档

- [CLAUDE.md](./CLAUDE.md) - 开发者文档（英文）
- [设计文档](../../notes-private/projects/Optima%20Ops%20CLI%20设计方案.md)
- [主项目 README](../../CLAUDE.md)

## License

MIT
