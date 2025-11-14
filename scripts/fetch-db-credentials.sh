#!/bin/bash
# ==============================================================================
# Optima Ops CLI - Database Credentials Fetcher
# ==============================================================================
#
# 从 AWS SSM 和 Terraform State 自动获取数据库凭证并生成配置文件
#
# 用法:
#   ./scripts/fetch-db-credentials.sh
#
# 前置条件:
#   - AWS CLI 已配置并有权限访问 SSM 和 S3
#   - jq 命令行工具已安装
#
# 输出:
#   .db-credentials.json (已加入 .gitignore)
#
# ==============================================================================

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 项目根目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CREDENTIALS_FILE="$PROJECT_ROOT/.db-credentials.json"

# Terraform State 配置
S3_BUCKET="optima-terraform-state-585891120210"
SHARED_STATE_KEY="shared/terraform.tfstate"
DB_MGMT_STATE_KEY="database-management/terraform.tfstate"

echo -e "${GREEN}=== Optima Ops CLI - 数据库凭证获取工具 ===${NC}"
echo ""

# ==============================================================================
# 检查依赖
# ==============================================================================

check_dependencies() {
  echo "检查依赖..."

  if ! command -v aws &> /dev/null; then
    echo -e "${RED}错误: AWS CLI 未安装${NC}"
    echo "请安装: https://aws.amazon.com/cli/"
    exit 1
  fi

  if ! command -v jq &> /dev/null; then
    echo -e "${RED}错误: jq 未安装${NC}"
    echo "请安装: sudo apt-get install jq (Linux) 或 brew install jq (macOS)"
    exit 1
  fi

  # 检查 AWS 凭证
  if ! aws sts get-caller-identity &> /dev/null; then
    echo -e "${RED}错误: AWS 凭证未配置或无效${NC}"
    echo "请运行: aws configure"
    exit 1
  fi

  echo -e "${GREEN}✓ 所有依赖检查通过${NC}"
  echo ""
}

# ==============================================================================
# 获取 Production 环境密码
# ==============================================================================

fetch_production_passwords() {
  echo "获取 Production 环境密码..."

  # 从 SSM Parameter Store 获取各服务密码
  local auth_pass=$(aws ssm get-parameter --name /optima/prod/user-auth/db-password --with-decryption --query 'Parameter.Value' --output text 2>/dev/null || echo "")
  local mcp_pass=$(aws ssm get-parameter --name /optima/prod/mcp-host/db-password --with-decryption --query 'Parameter.Value' --output text 2>/dev/null || echo "")
  local commerce_pass=$(aws ssm get-parameter --name /optima/prod/commerce-backend/database-url --with-decryption --query 'Parameter.Value' --output text 2>/dev/null | grep -oP '://[^:]+:\K[^@]+' || echo "")
  local chat_pass=$(aws ssm get-parameter --name /optima/prod/agentic-chat/db-password --with-decryption --query 'Parameter.Value' --output text 2>/dev/null || echo "")

  # 从 Terraform State 获取 master 密码
  local master_pass=$(aws s3 cp s3://${S3_BUCKET}/${SHARED_STATE_KEY} - 2>/dev/null | jq -r '.resources[] | select(.type == "aws_db_instance") | .instances[0].attributes.password' | head -1)

  if [ -z "$master_pass" ]; then
    echo -e "${YELLOW}警告: 无法从 Terraform State 获取 master 密码${NC}"
    master_pass="PLEASE_SET_MASTER_PASSWORD"
  fi

  cat > /tmp/prod_creds.json <<EOF
{
  "optima_admin": {
    "user": "optima_admin",
    "password": "${master_pass}",
    "database": "postgres",
    "note": "Master password from terraform state - has access to all databases"
  },
  "optima_auth": {
    "user": "auth_user",
    "password": "${auth_pass:-MISSING}",
    "database": "optima_auth"
  },
  "optima_mcp": {
    "user": "mcp_user",
    "password": "${mcp_pass:-MISSING}",
    "database": "optima_mcp"
  },
  "optima_commerce": {
    "user": "commerce_user",
    "password": "${commerce_pass:-MISSING}",
    "database": "optima_commerce"
  },
  "optima_chat": {
    "user": "chat_user",
    "password": "${chat_pass:-MISSING}",
    "database": "optima_chat"
  }
}
EOF

  echo -e "${GREEN}✓ Production 环境密码获取完成${NC}"
}

# ==============================================================================
# 获取 Stage 环境密码
# ==============================================================================

fetch_stage_passwords() {
  echo "获取 Stage 环境密码..."

  # 从 Terraform State 获取 Stage 数据库凭证
  local stage_creds=$(aws s3 cp s3://${S3_BUCKET}/${DB_MGMT_STATE_KEY} - 2>/dev/null | jq -c '.outputs.stage_database_credentials.value')

  if [ -z "$stage_creds" ] || [ "$stage_creds" = "null" ]; then
    echo -e "${YELLOW}警告: 无法从 Terraform State 获取 Stage 凭证${NC}"
    cat > /tmp/stage_creds.json <<EOF
{
  "optima_admin": {
    "user": "optima_admin",
    "password": "PLEASE_SET_MASTER_PASSWORD",
    "database": "postgres",
    "note": "Master password from terraform state - has access to all databases"
  }
}
EOF
  else
    # 解析 Terraform 输出并转换为我们的格式
    local master_pass=$(aws s3 cp s3://${S3_BUCKET}/${SHARED_STATE_KEY} - 2>/dev/null | jq -r '.resources[] | select(.type == "aws_db_instance") | .instances[0].attributes.password' | head -1)

    echo "$stage_creds" | jq --arg master_pass "$master_pass" '{
      optima_admin: {
        user: "optima_admin",
        password: $master_pass,
        database: "postgres",
        note: "Master password from terraform state - has access to all databases"
      },
      optima_stage_auth: {
        user: .auth.db_user,
        password: .auth.db_password,
        database: .auth.db_name
      },
      optima_stage_mcp: {
        user: .mcp.db_user,
        password: .mcp.db_password,
        database: .mcp.db_name
      },
      optima_stage_commerce: {
        user: .commerce.db_user,
        password: .commerce.db_password,
        database: .commerce.db_name
      },
      optima_stage_chat: {
        user: .chat.db_user,
        password: .chat.db_password,
        database: .chat.db_name
      },
      optima_infisical: {
        user: .infisical.db_user,
        password: .infisical.db_password,
        database: .infisical.db_name
      }
    }' > /tmp/stage_creds.json
  fi

  echo -e "${GREEN}✓ Stage 环境密码获取完成${NC}"
}

# ==============================================================================
# 生成最终配置文件
# ==============================================================================

generate_config_file() {
  echo "生成配置文件..."

  # 获取 RDS 信息
  local rds_host=$(aws s3 cp s3://${S3_BUCKET}/${SHARED_STATE_KEY} - 2>/dev/null | jq -r '.outputs.rds_instance_address.value')

  if [ -z "$rds_host" ] || [ "$rds_host" = "null" ]; then
    rds_host="optima-prod-postgres.ctg866o0ehac.ap-southeast-1.rds.amazonaws.com"
  fi

  # 合并 Production 和 Stage 凭证
  jq -n \
    --slurpfile prod /tmp/prod_creds.json \
    --slurpfile stage /tmp/stage_creds.json \
    --arg rds_host "$rds_host" \
    --arg timestamp "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    '{
      production: $prod[0],
      stage: $stage[0],
      rds: {
        host: $rds_host,
        port: 5432
      },
      _metadata: {
        generated: $timestamp,
        source: {
          production_passwords: "AWS SSM Parameter Store (/optima/prod/*/db-password)",
          stage_passwords: "Terraform State (s3://optima-terraform-state-585891120210/database-management/terraform.tfstate)",
          master_password: "Terraform State (s3://optima-terraform-state-585891120210/shared/terraform.tfstate)"
        },
        note: "This file contains database credentials. Already in .gitignore."
      }
    }' > "$CREDENTIALS_FILE"

  # 清理临时文件
  rm -f /tmp/prod_creds.json /tmp/stage_creds.json

  echo -e "${GREEN}✓ 配置文件已生成: $CREDENTIALS_FILE${NC}"
}

# ==============================================================================
# 验证配置文件
# ==============================================================================

validate_config() {
  echo ""
  echo "验证配置文件..."

  # 检查必要的字段
  local missing_passwords=0

  while IFS= read -r line; do
    echo -e "${YELLOW}警告: $line${NC}"
    ((missing_passwords++))
  done < <(jq -r '
    .production, .stage |
    to_entries[] |
    select(.value.password == "MISSING" or .value.password == "PLEASE_SET_MASTER_PASSWORD") |
    "\(.key): 密码缺失"
  ' "$CREDENTIALS_FILE")

  if [ $missing_passwords -eq 0 ]; then
    echo -e "${GREEN}✓ 所有密码已成功获取${NC}"
  else
    echo -e "${YELLOW}⚠ 有 $missing_passwords 个密码缺失，请手动补充${NC}"
  fi

  # 显示摘要
  echo ""
  echo "配置摘要:"
  jq -r '
    "Production 数据库: " + (.production | keys | join(", ")) +
    "\nStage 数据库: " + (.stage | keys | join(", ")) +
    "\nRDS 主机: " + .rds.host
  ' "$CREDENTIALS_FILE"
}

# ==============================================================================
# 安全提示
# ==============================================================================

show_security_notes() {
  echo ""
  echo -e "${YELLOW}=== 安全提示 ===${NC}"
  echo "1. 此文件包含敏感凭证，请勿提交到 Git"
  echo "2. 已自动加入 .gitignore，请不要移除"
  echo "3. 建议设置文件权限: chmod 600 $CREDENTIALS_FILE"
  echo "4. 定期更新密码并重新运行此脚本"
  echo ""

  # 设置文件权限
  chmod 600 "$CREDENTIALS_FILE"
  echo -e "${GREEN}✓ 文件权限已设置为 600${NC}"
}

# ==============================================================================
# 主流程
# ==============================================================================

main() {
  check_dependencies
  fetch_production_passwords
  fetch_stage_passwords
  generate_config_file
  validate_config
  show_security_notes

  echo ""
  echo -e "${GREEN}=== 完成！===${NC}"
  echo "凭证文件已生成: $CREDENTIALS_FILE"
  echo ""
  echo "测试连接:"
  echo "  npm run dev -- db list --json"
  echo ""
}

# 执行主流程
main
