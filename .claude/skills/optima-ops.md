---
skill: optima-ops
description: Optima运维CLI工具 - 监控、部署、数据库、基础设施管理
auto_invoke: true
---

# Optima Ops CLI Skill

## 项目信息

**项目路径**: `/mnt/d/work_optima_new/cli-tools/optima-ops-cli`
**技术栈**: TypeScript, Commander.js, ink (TUI), AWS SDK v3, SSH2
**开发命令**: `npm run dev --`
**包管理器**: pnpm (推荐)

## 🖥️ 实时监控 TUI (⭐ 新增)

```bash
# 启动交互式监控面板
npm run dev -- monitor dashboard

# 指定环境
npm run dev -- monitor dashboard --env production
npm run dev -- monitor dashboard --env stage

# 自定义刷新间隔（秒）
npm run dev -- monitor dashboard --interval 10
```

**功能**:
- 🏥 服务健康监控 (HTTP 端点 + 响应时间)
- 🔵 蓝绿部署状态 (ECS 任务数 + ALB 流量分配)
- 🐳 Docker 资源监控 (CPU, 内存, 网络)
- ⌨️ 快捷键: q=退出

**数据来源**:
- 服务健康: HTTP /health 端点 (axios)
- 蓝绿状态: AWS ECS API + ALB API
- Docker 资源: SSH 执行 `docker stats`

## 常用命令速查

### 服务管理
```bash
npm run dev -- services health                    # 所有服务健康检查
npm run dev -- services status                    # 容器状态
npm run dev -- services logs user-auth --tail 100 # 查看日志
npm run dev -- services restart user-auth         # 重启服务
```

### 部署管理
```bash
npm run dev -- deploy status user-auth            # 部署历史
npm run dev -- deploy watch user-auth             # 实时监控部署
npm run dev -- deploy list                        # 所有服务状态
npm run dev -- deploy trigger user-auth           # 触发部署
```

### 数据库管理
```bash
npm run dev -- db init-credentials                # 初始化凭证（首次）
npm run dev -- db list                            # 列出所有数据库
npm run dev -- db tables --database optima_auth   # 查看表
npm run dev -- db health --database optima_auth   # 健康检查
npm run dev -- db connections --database optima_auth # 连接数
```

### 基础设施监控
```bash
npm run dev -- infra ec2                          # EC2 实例信息
npm run dev -- infra docker                       # Docker 容器资源
npm run dev -- infra disk                         # 磁盘使用
npm run dev -- infra network                      # 网络配置
npm run dev -- infra runner                       # GitHub Runner
```

### 配置管理
```bash
npm run dev -- config show user-auth              # 查看所有配置
npm run dev -- config get user-auth DATABASE_URL  # 单个参数
npm run dev -- config compare user-auth --from-env prod --to-env stage
```

### 部署验证
```bash
npm run dev -- validate spec user-auth            # 配置规范
npm run dev -- validate pre user-auth             # 部署前验证
npm run dev -- validate post user-auth            # 部署后验证
npm run dev -- validate diff user-auth --from-env prod --to-env stage
```

## 支持的服务

**核心服务**: user-auth, mcp-host, commerce-backend, agentic-chat
**MCP 工具**: comfy-mcp, fetch-mcp, perplexity-mcp, shopify-mcp, commerce-mcp, google-ads-mcp

## 环境变量

```bash
export OPTIMA_OPS_ENV=production  # 环境选择
export OPTIMA_OUTPUT=json         # JSON 输出
export OPTIMA_TIMING=1            # 启用计时
export DEBUG=1                    # 调试模式
export OPTIMA_SSH_KEY=~/.ssh/optima-ec2-key
```

## 开发提示

- 所有命令支持 `--json` 和 `--env` 参数
- TUI 监控需要 AWS 凭证和 SSH 访问权限
- 首次使用数据库功能需运行 `db init-credentials`
- 修改 TUI 组件后无需重启，保存即生效（tsx hot reload）

---

**版本**: 1.1.0 (TUI 监控已上线)
**更新**: 2025-11-18
