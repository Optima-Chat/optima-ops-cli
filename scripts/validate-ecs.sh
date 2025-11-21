#!/usr/bin/env bash

# ==============================================================================
# ECS 部署验证脚本
# ==============================================================================
# 用途: 验证 ECS 服务部署状态
# 使用: ./validate-ecs.sh <service-name> <environment> [--mode <pre|post|all>]
# 示例: ./validate-ecs.sh user-auth stage --mode post
# ==============================================================================

set -euo pipefail

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 默认值
AWS_REGION="${AWS_REGION:-ap-southeast-1}"
MODE="post"  # pre, post, all

# 打印函数
print_header() {
    echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

# 使用说明
usage() {
    cat << EOF
用法: $0 <service-name> <environment> [选项]

参数:
    service-name    服务名称 (如: user-auth)
    environment     环境 (stage 或 prod)

选项:
    --mode <mode>   验证模式 (pre|post|all，默认: post)
    --region <region> AWS 区域 (默认: ap-southeast-1)
    -h, --help      显示帮助信息

验证模式:
    pre   - 部署前验证 (ECR 镜像、Task Definition)
    post  - 部署后验证 (ECS 服务状态、健康检查、日志)
    all   - 完整验证 (pre + post)

示例:
    $0 user-auth stage --mode post
    $0 user-auth stage --mode all
    $0 mcp-host stage --mode pre --region ap-southeast-1

EOF
    exit 1
}

# 参数解析
if [[ $# -lt 2 ]]; then
    usage
fi

SERVICE_NAME="$1"
ENVIRONMENT="$2"
shift 2

# 解析选项
while [[ $# -gt 0 ]]; do
    case $1 in
        --mode)
            MODE="$2"
            shift 2
            ;;
        --region)
            AWS_REGION="$2"
            shift 2
            ;;
        -h|--help)
            usage
            ;;
        *)
            echo "未知选项: $1"
            usage
            ;;
    esac
done

# 验证参数
if [[ ! "$ENVIRONMENT" =~ ^(stage|prod)$ ]]; then
    print_error "无效的环境: $ENVIRONMENT (必须是 stage 或 prod)"
    exit 1
fi

if [[ ! "$MODE" =~ ^(pre|post|all)$ ]]; then
    print_error "无效的模式: $MODE (必须是 pre, post 或 all)"
    exit 1
fi

# 设置环境相关变量
CLUSTER_NAME="optima-cluster"
ECS_SERVICE_NAME="${SERVICE_NAME}-${ENVIRONMENT}"
TASK_DEFINITION="${SERVICE_NAME}-${ENVIRONMENT}"
ECR_REPO="${SERVICE_NAME}-${ENVIRONMENT}-ecs"
LOG_GROUP="/ecs/${SERVICE_NAME}-${ENVIRONMENT}"

# 根据服务获取域名
get_service_domain() {
    case "$SERVICE_NAME" in
        user-auth)
            echo "auth.${ENVIRONMENT}.optima.onl"
            ;;
        user-auth-admin)
            echo "portal.admin.${ENVIRONMENT}.optima.onl"
            ;;
        commerce-backend)
            echo "api.${ENVIRONMENT}.optima.onl"
            ;;
        mcp-host)
            echo "host.mcp.${ENVIRONMENT}.optima.onl"
            ;;
        agentic-chat)
            echo "ai.${ENVIRONMENT}.optima.onl"
            ;;
        *)
            echo ""
            ;;
    esac
}

SERVICE_DOMAIN=$(get_service_domain)

# ==============================================================================
# 部署前验证
# ==============================================================================
validate_pre() {
    print_header "📋 部署前验证 - $SERVICE_NAME ($ENVIRONMENT)"

    # 1. 检查 ECR 镜像
    print_info "检查 ECR 镜像..."
    if aws ecr describe-images \
        --repository-name "$ECR_REPO" \
        --image-ids imageTag=latest \
        --region "$AWS_REGION" \
        --output json > /dev/null 2>&1; then

        IMAGE_DIGEST=$(aws ecr describe-images \
            --repository-name "$ECR_REPO" \
            --image-ids imageTag=latest \
            --region "$AWS_REGION" \
            --query 'imageDetails[0].imageDigest' \
            --output text)

        IMAGE_PUSHED_AT=$(aws ecr describe-images \
            --repository-name "$ECR_REPO" \
            --image-ids imageTag=latest \
            --region "$AWS_REGION" \
            --query 'imageDetails[0].imagePushedAt' \
            --output text)

        print_success "ECR 镜像存在"
        echo "  仓库: $ECR_REPO"
        echo "  标签: latest"
        echo "  Digest: ${IMAGE_DIGEST:0:20}..."
        echo "  推送时间: $IMAGE_PUSHED_AT"
    else
        print_error "ECR 镜像不存在: $ECR_REPO:latest"
        return 1
    fi

    # 2. 检查 Task Definition
    print_info "检查 Task Definition..."
    if TASK_DEF_ARN=$(aws ecs describe-task-definition \
        --task-definition "$TASK_DEFINITION" \
        --region "$AWS_REGION" \
        --query 'taskDefinition.taskDefinitionArn' \
        --output text 2>/dev/null); then

        TASK_DEF_REVISION=$(echo "$TASK_DEF_ARN" | awk -F':' '{print $NF}')
        TASK_DEF_CPU=$(aws ecs describe-task-definition \
            --task-definition "$TASK_DEFINITION" \
            --region "$AWS_REGION" \
            --query 'taskDefinition.cpu' \
            --output text)
        TASK_DEF_MEMORY=$(aws ecs describe-task-definition \
            --task-definition "$TASK_DEFINITION" \
            --region "$AWS_REGION" \
            --query 'taskDefinition.memory' \
            --output text)

        print_success "Task Definition 存在"
        echo "  Family: $TASK_DEFINITION"
        echo "  Revision: $TASK_DEF_REVISION"
        echo "  CPU: $TASK_DEF_CPU"
        echo "  Memory: $TASK_DEF_MEMORY"
    else
        print_error "Task Definition 不存在: $TASK_DEFINITION"
        return 1
    fi

    # 3. 检查 Migration Task Definition (如果是 user-auth)
    if [[ "$SERVICE_NAME" == "user-auth" ]]; then
        print_info "检查 Migration Task Definition..."
        MIGRATION_TASK_DEF="${SERVICE_NAME}-migration-${ENVIRONMENT}"

        if MIGRATION_ARN=$(aws ecs describe-task-definition \
            --task-definition "$MIGRATION_TASK_DEF" \
            --region "$AWS_REGION" \
            --query 'taskDefinition.taskDefinitionArn' \
            --output text 2>/dev/null); then

            print_success "Migration Task Definition 存在"
            echo "  Family: $MIGRATION_TASK_DEF"
        else
            print_warning "Migration Task Definition 不存在: $MIGRATION_TASK_DEF"
        fi
    fi

    # 4. 配置验证 (通过 optima-ops CLI)
    print_info "验证 Infisical 配置..."

    # 检查 optima-ops CLI 是否可用
    OPS_CLI_DIR="/mnt/d/work_optima_new/cli-tools/optima-ops-cli"
    if [[ -d "$OPS_CLI_DIR" ]]; then
        # 检查是否设置了 Infisical 环境变量
        if [[ -n "$INFISICAL_CLIENT_ID" ]] && [[ -n "$INFISICAL_CLIENT_SECRET" ]]; then
            # 运行配置验证
            if cd "$OPS_CLI_DIR" && npm run dev -- validate pre "$SERVICE_NAME" --env "$ENVIRONMENT" --platform ecs --source infisical 2>/dev/null; then
                print_success "Infisical 配置验证通过"
            else
                print_warning "Infisical 配置验证失败或有警告"
                echo "  提示: 请检查 Infisical 中的配置是否完整"
            fi
        else
            print_warning "跳过 Infisical 配置验证 (未设置 INFISICAL_CLIENT_ID/INFISICAL_CLIENT_SECRET)"
            echo "  提示: 设置环境变量后可启用配置验证"
        fi
    else
        print_warning "跳过配置验证 (optima-ops-cli 不可用)"
    fi

    echo ""
    print_success "部署前验证通过！"
    return 0
}

# ==============================================================================
# 部署后验证
# ==============================================================================
validate_post() {
    print_header "🔍 部署后验证 - $SERVICE_NAME ($ENVIRONMENT)"

    # 1. 检查 ECS 服务状态
    print_info "检查 ECS 服务状态..."
    SERVICE_STATUS=$(aws ecs describe-services \
        --cluster "$CLUSTER_NAME" \
        --services "$ECS_SERVICE_NAME" \
        --region "$AWS_REGION" \
        --query 'services[0].{Status:status,Running:runningCount,Desired:desiredCount,Pending:pendingCount}' \
        --output json 2>/dev/null)

    if [[ -z "$SERVICE_STATUS" ]] || [[ "$SERVICE_STATUS" == "null" ]]; then
        print_error "ECS 服务不存在: $ECS_SERVICE_NAME"
        return 1
    fi

    STATUS=$(echo "$SERVICE_STATUS" | jq -r '.Status')
    RUNNING=$(echo "$SERVICE_STATUS" | jq -r '.Running')
    DESIRED=$(echo "$SERVICE_STATUS" | jq -r '.Desired')
    PENDING=$(echo "$SERVICE_STATUS" | jq -r '.Pending')

    if [[ "$STATUS" == "ACTIVE" ]] && [[ "$RUNNING" -eq "$DESIRED" ]] && [[ "$PENDING" -eq 0 ]]; then
        print_success "ECS 服务状态正常"
        echo "  状态: $STATUS"
        echo "  运行中: $RUNNING / $DESIRED"
        echo "  等待中: $PENDING"
    else
        print_error "ECS 服务状态异常"
        echo "  状态: $STATUS"
        echo "  运行中: $RUNNING / $DESIRED"
        echo "  等待中: $PENDING"
        return 1
    fi

    # 2. 检查任务健康状态
    print_info "检查 ECS 任务健康状态..."
    TASK_ARN=$(aws ecs list-tasks \
        --cluster "$CLUSTER_NAME" \
        --service-name "$ECS_SERVICE_NAME" \
        --region "$AWS_REGION" \
        --query 'taskArns[0]' \
        --output text)

    if [[ -z "$TASK_ARN" ]] || [[ "$TASK_ARN" == "None" ]]; then
        print_error "未找到运行中的任务"
        return 1
    fi

    TASK_STATUS=$(aws ecs describe-tasks \
        --cluster "$CLUSTER_NAME" \
        --tasks "$TASK_ARN" \
        --region "$AWS_REGION" \
        --query 'tasks[0].{HealthStatus:healthStatus,LastStatus:lastStatus,StartedAt:startedAt}' \
        --output json)

    HEALTH_STATUS=$(echo "$TASK_STATUS" | jq -r '.HealthStatus')
    LAST_STATUS=$(echo "$TASK_STATUS" | jq -r '.LastStatus')
    STARTED_AT=$(echo "$TASK_STATUS" | jq -r '.StartedAt')

    if [[ "$HEALTH_STATUS" == "HEALTHY" ]] && [[ "$LAST_STATUS" == "RUNNING" ]]; then
        print_success "ECS 任务健康状态正常"
        echo "  健康状态: $HEALTH_STATUS"
        echo "  运行状态: $LAST_STATUS"
        echo "  启动时间: $STARTED_AT"
    else
        print_error "ECS 任务健康状态异常"
        echo "  健康状态: $HEALTH_STATUS"
        echo "  运行状态: $LAST_STATUS"
        return 1
    fi

    # 3. 检查 CloudWatch Logs 最近错误
    print_info "检查 CloudWatch Logs (最近 10 分钟)..."
    ERROR_COUNT=$(aws logs filter-log-events \
        --log-group-name "$LOG_GROUP" \
        --filter-pattern "ERROR" \
        --start-time $(($(date +%s) - 600))000 \
        --region "$AWS_REGION" \
        --query 'events' \
        --output json 2>/dev/null | jq length)

    if [[ "$ERROR_COUNT" -eq 0 ]]; then
        print_success "最近 10 分钟无 ERROR 日志"
    else
        print_warning "最近 10 分钟发现 $ERROR_COUNT 条 ERROR 日志"
        echo "  查看日志: aws logs tail $LOG_GROUP --since 10m --region $AWS_REGION"
    fi

    # 4. 健康检查端点测试 (如果有域名)
    if [[ -n "$SERVICE_DOMAIN" ]]; then
        print_info "测试健康检查端点..."
        HEALTH_URL="https://${SERVICE_DOMAIN}/health"

        if HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$HEALTH_URL" 2>/dev/null); then
            if [[ "$HTTP_CODE" == "200" ]]; then
                print_success "健康检查端点正常"
                echo "  URL: $HEALTH_URL"
                echo "  状态码: $HTTP_CODE"
            else
                print_error "健康检查端点异常"
                echo "  URL: $HEALTH_URL"
                echo "  状态码: $HTTP_CODE"
                return 1
            fi
        else
            print_error "无法连接到健康检查端点: $HEALTH_URL"
            return 1
        fi
    else
        print_warning "未配置服务域名，跳过健康检查端点测试"
    fi

    # 5. 检查 Migration Task (如果是 user-auth)
    if [[ "$SERVICE_NAME" == "user-auth" ]]; then
        print_info "检查最近的 Migration Task..."
        MIGRATION_TASK_FAMILY="${SERVICE_NAME}-migration-${ENVIRONMENT}"

        MIGRATION_TASK_ARN=$(aws ecs list-tasks \
            --cluster "$CLUSTER_NAME" \
            --family "$MIGRATION_TASK_FAMILY" \
            --region "$AWS_REGION" \
            --query 'taskArns[0]' \
            --output text 2>/dev/null)

        if [[ -n "$MIGRATION_TASK_ARN" ]] && [[ "$MIGRATION_TASK_ARN" != "None" ]]; then
            MIGRATION_STATUS=$(aws ecs describe-tasks \
                --cluster "$CLUSTER_NAME" \
                --tasks "$MIGRATION_TASK_ARN" \
                --region "$AWS_REGION" \
                --query 'tasks[0].{Status:lastStatus,ExitCode:containers[0].exitCode,StoppedAt:stoppedAt}' \
                --output json)

            EXIT_CODE=$(echo "$MIGRATION_STATUS" | jq -r '.ExitCode')
            STOPPED_AT=$(echo "$MIGRATION_STATUS" | jq -r '.StoppedAt')

            if [[ "$EXIT_CODE" == "0" ]]; then
                print_success "Migration Task 执行成功"
                echo "  退出代码: $EXIT_CODE"
                echo "  完成时间: $STOPPED_AT"
            else
                print_error "Migration Task 执行失败"
                echo "  退出代码: $EXIT_CODE"
                echo "  查看日志: aws logs tail /ecs/${MIGRATION_TASK_FAMILY} --since 30m --region $AWS_REGION"
                return 1
            fi
        else
            print_warning "未找到最近的 Migration Task 执行记录"
        fi
    fi

    echo ""
    print_success "部署后验证通过！"
    return 0
}

# ==============================================================================
# 主函数
# ==============================================================================
main() {
    print_header "🚀 ECS 部署验证 - $SERVICE_NAME ($ENVIRONMENT)"
    echo "模式: $MODE"
    echo "区域: $AWS_REGION"
    echo "集群: $CLUSTER_NAME"
    echo "服务: $ECS_SERVICE_NAME"
    echo ""

    case "$MODE" in
        pre)
            validate_pre
            ;;
        post)
            validate_post
            ;;
        all)
            validate_pre && echo "" && validate_post
            ;;
    esac

    exit_code=$?

    if [[ $exit_code -eq 0 ]]; then
        print_header "✅ 验证成功完成"
    else
        print_header "❌ 验证失败"
    fi

    exit $exit_code
}

# 执行主函数
main
