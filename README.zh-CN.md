# Optima Ops CLI - 运维监控工具

> **Optima 基础设施的运维监控命令行工具**

一个专为 Optima 基础设施设计的 DevOps 和 SRE 工具，采用**只读优先**的安全设计理念。

## 核心特性

- 🏥 **服务健康监控** - HTTP 端点检查 + Docker 容器状态
- 🚀 **部署追踪** - GitHub Actions 集成，查看部署历史
- 🗄️ **数据库探索** - 预定义查询、Schema 检查（即将推出）
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

# JSON 输出（适合脚本）
optima-ops services health --json
```

## 可用命令

### Services 服务管理

```bash
# 健康检查
optima-ops services health [--env prod|stage|dev] [--service <name>] [--json]
```

**即将推出：**
- `services status` - 查看容器状态
- `services logs <service>` - 查看容器日志
- `services inspect <service>` - 查看容器配置
- `services restart <service>` - 重启服务（需确认）

### Deploy 部署管理

```bash
# 查看部署历史
optima-ops deploy status <service> [--env prod|stage|dev] [--limit 10]
```

**即将推出：**
- `deploy watch` - 实时监控部署
- `deploy list` - 列出所有服务部署状态
- `deploy logs` - 查看部署日志
- `deploy trigger` - 触发部署（需确认）

### 即将推出的模块

- **Database 模块** - 数据库查询、Schema 探索
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

- [x] **Phase 1**（当前）：Services + Deploy 模块
  - [x] 核心工具类
  - [x] SSH 客户端（命令白名单）
  - [x] AWS SDK 客户端
  - [x] GitHub CLI 包装器
  - [x] `services health`
  - [x] `deploy status`
  - [ ] 其他 services 命令
  - [ ] 其他 deploy 命令

- [ ] **Phase 2**: Database 模块
- [ ] **Phase 3**: Infrastructure 模块
- [ ] **Phase 4**: Logs 模块
- [ ] **Phase 5**: Config 模块

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
