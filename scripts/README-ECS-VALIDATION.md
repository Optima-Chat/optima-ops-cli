# ECS 部署验证脚本使用指南

## 概述

`validate-ecs.sh` 是用于验证 AWS ECS 服务部署状态的脚本，支持部署前和部署后的完整验证流程。

## 快速开始

### 基本用法

```bash
# 部署后验证 (默认)
./scripts/validate-ecs.sh user-auth stage --mode post

# 部署前验证
./scripts/validate-ecs.sh user-auth stage --mode pre

# 完整验证 (部署前 + 部署后)
./scripts/validate-ecs.sh user-auth stage --mode all
```

### 参数说明

```
validate-ecs.sh <service-name> <environment> [选项]

必需参数:
  service-name    服务名称 (如: user-auth, mcp-host, commerce-backend)
  environment     环境名称 (stage 或 prod)

可选参数:
  --mode <mode>   验证模式 (pre|post|all，默认: post)
  --region <region> AWS 区域 (默认: ap-southeast-1)
  -h, --help      显示帮助信息
```

## 验证模式

### 1. 部署前验证 (`--mode pre`)

验证部署所需的先决条件：

**检查项**:
- ✅ ECR 镜像存在性和元数据
- ✅ ECS Task Definition 配置
- ✅ Migration Task Definition (仅 user-auth)

**示例**:
```bash
./scripts/validate-ecs.sh user-auth stage --mode pre
```

**输出示例**:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 部署前验证 - user-auth (stage)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ℹ 检查 ECR 镜像...
✓ ECR 镜像存在
  仓库: user-auth-stage-ecs
  标签: latest
  Digest: sha256:abc123...
  推送时间: 2025-11-21T10:30:00Z

ℹ 检查 Task Definition...
✓ Task Definition 存在
  Family: user-auth-stage
  Revision: 5
  CPU: 256
  Memory: 384

✓ 部署前验证通过！
```

### 2. 部署后验证 (`--mode post`)

验证部署后的服务运行状态：

**检查项**:
- ✅ ECS 服务状态 (ACTIVE, 运行数量)
- ✅ ECS 任务健康状态 (HEALTHY, RUNNING)
- ✅ CloudWatch Logs 错误检查 (最近 10 分钟)
- ✅ 健康检查端点测试 (HTTPS)
- ✅ Migration Task 执行状态 (仅 user-auth)

**示例**:
```bash
./scripts/validate-ecs.sh user-auth stage --mode post
```

**输出示例**:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔍 部署后验证 - user-auth (stage)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ℹ 检查 ECS 服务状态...
✓ ECS 服务状态正常
  状态: ACTIVE
  运行中: 1 / 1
  等待中: 0

ℹ 检查 ECS 任务健康状态...
✓ ECS 任务健康状态正常
  健康状态: HEALTHY
  运行状态: RUNNING
  启动时间: 2025-11-21T10:35:00Z

ℹ 检查 CloudWatch Logs (最近 10 分钟)...
✓ 最近 10 分钟无 ERROR 日志

ℹ 测试健康检查端点...
✓ 健康检查端点正常
  URL: https://auth.stage.optima.onl/health
  状态码: 200

ℹ 检查最近的 Migration Task...
✓ Migration Task 执行成功
  退出代码: 0
  完成时间: 2025-11-21T10:34:00Z

✓ 部署后验证通过！
```

### 3. 完整验证 (`--mode all`)

同时执行部署前和部署后验证。

**示例**:
```bash
./scripts/validate-ecs.sh user-auth stage --mode all
```

## 支持的服务

脚本自动识别以下服务的域名和配置：

| 服务名称 | 域名模板 | 健康检查端点 |
|---------|---------|-------------|
| user-auth | auth.{env}.optima.onl | /health |
| user-auth-admin | portal.admin.{env}.optima.onl | / |
| commerce-backend | api.{env}.optima.onl | /health |
| mcp-host | host.mcp.{env}.optima.onl | /health |
| agentic-chat | ai.{env}.optima.onl | /api/health |

## 使用场景

### 场景 1: GitHub Actions 部署前检查

```yaml
- name: Pre-deployment validation
  run: |
    ./scripts/validate-ecs.sh user-auth stage --mode pre
```

### 场景 2: GitHub Actions 部署后验证

```yaml
- name: Post-deployment validation
  run: |
    ./scripts/validate-ecs.sh user-auth stage --mode post
```

### 场景 3: 本地手动验证

```bash
# 验证 user-auth 服务的部署状态
./scripts/validate-ecs.sh user-auth stage --mode all

# 验证 mcp-host 服务
./scripts/validate-ecs.sh mcp-host stage --mode post

# 验证 prod 环境的 commerce-backend
./scripts/validate-ecs.sh commerce-backend prod --mode post
```

### 场景 4: CI/CD 流水线集成

```bash
# 在部署流程中使用
terraform apply -auto-approve && \
  sleep 60 && \
  ./scripts/validate-ecs.sh user-auth stage --mode post
```

## 错误处理

### 常见错误及解决方法

#### 1. ECR 镜像不存在

**错误**:
```
✗ ECR 镜像不存在: user-auth-stage-ecs:latest
```

**解决方法**:
- 检查 GitHub Actions workflow 是否成功构建并推送镜像
- 确认 ECR 仓库名称正确
- 运行构建流程：`gh workflow run deploy-unified.yml -f environment=stage -f mode=build-deploy`

#### 2. ECS 服务状态异常

**错误**:
```
✗ ECS 服务状态异常
  状态: ACTIVE
  运行中: 0 / 1
  等待中: 1
```

**解决方法**:
- 查看 ECS 服务事件：`aws ecs describe-services --cluster optima-cluster --services user-auth-stage`
- 检查任务启动失败原因
- 查看 CloudWatch Logs：`aws logs tail /ecs/user-auth-stage --since 30m`

#### 3. 健康检查端点失败

**错误**:
```
✗ 健康检查端点异常
  URL: https://auth.stage.optima.onl/health
  状态码: 503
```

**解决方法**:
- 检查 ALB Target Group 健康状态
- 验证应用启动是否完成
- 检查应用日志是否有启动错误

#### 4. Migration Task 失败

**错误**:
```
✗ Migration Task 执行失败
  退出代码: 1
```

**解决方法**:
- 查看 Migration 日志：`aws logs tail /ecs/user-auth-migration-stage --since 30m`
- 检查数据库连接配置
- 验证 Alembic 迁移脚本是否正确

## 高级用法

### 指定 AWS 区域

```bash
./scripts/validate-ecs.sh user-auth stage --mode post --region us-west-2
```

### 结合其他工具使用

```bash
# 验证并输出到文件
./scripts/validate-ecs.sh user-auth stage --mode all > validation-report.log 2>&1

# 验证失败时发送通知
./scripts/validate-ecs.sh user-auth stage --mode post || \
  echo "Deployment validation failed!" | mail -s "Alert" admin@example.com
```

## 依赖要求

### 必需工具

- `aws` - AWS CLI v2
- `jq` - JSON 处理工具
- `curl` - HTTP 请求工具

### AWS 权限

脚本需要以下 AWS IAM 权限：

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ecr:DescribeImages",
        "ecs:DescribeServices",
        "ecs:DescribeTasks",
        "ecs:DescribeTaskDefinition",
        "ecs:ListTasks",
        "logs:FilterLogEvents",
        "logs:GetLogEvents"
      ],
      "Resource": "*"
    }
  ]
}
```

## 相关文档

- [ECS 验证方法详解](../../../notes-private/projects/ecs-deployment-guide/01-ECS验证方法.md)
- [ops-cli ECS 增强计划](../../../notes-private/projects/ecs-deployment-guide/02-ops-cli增强计划.md)
- [GitHub Actions 部署 Workflow](../../../core-services/user-auth/.github/workflows/deploy-unified.yml)

## 贡献

如需添加新服务支持或改进验证逻辑，请：

1. 修改 `get_service_domain()` 函数添加域名映射
2. 更新服务列表表格
3. 提交 PR 并附上测试结果

## 许可

MIT License
