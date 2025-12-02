#!/usr/bin/env python3
"""
对比 Infisical 展开后的配置 (expanded/) 和审计后的 archive-v2
验证同步是否正确
"""

import sys
from pathlib import Path
from typing import Dict

BASE_DIR = Path(__file__).parent.parent
EXPANDED_DIR = BASE_DIR / "expanded"
ARCHIVE_V2_DIR = BASE_DIR / "archive-v2" / "services"

# 服务列表
SERVICES = [
    "user-auth", "mcp-host", "commerce-backend", "agentic-chat",
    "comfy-mcp", "fetch-mcp", "perplexity-mcp", "shopify-mcp",
    "chart-mcp", "commerce-mcp", "google-ads-mcp"
]

# 预期会有差异的 key（引用展开后会有实际值）
EXPECTED_DIFF_KEYS = {
    # 数据库相关 (引用展开)
    "DATABASE_URL", "DB_HOST", "DB_PORT", "DB_NAME", "DB_USER", "DB_PASSWORD",
    "DATABASE_HOST", "DATABASE_PORT",
    # Redis 相关
    "REDIS_URL", "REDIS_HOST", "REDIS_PORT", "REDIS_DB",
    # API Keys (引用展开)
    "ANTHROPIC_API_KEY", "OPENAI_API_KEY", "PERPLEXITY_API_KEY",
    "RESEND_API_KEY", "GOOGLE_ADS_CLIENT_ID", "GOOGLE_ADS_CLIENT_SECRET",
    "GOOGLE_ADS_DEVELOPER_TOKEN", "GOOGLE_ADS_REFRESH_TOKEN",
    "GOOGLE_ADS_MANAGER_ACCOUNT_ID", "GOOGLE_ADS_CUSTOMER_ID", "GOOGLE_ADS_LOGIN_CUSTOMER_ID",
    "SHOPIFY_ACCESS_TOKEN", "SHOPIFY_SHOP_DOMAIN",
    "EASYSHIP_API_KEY", "EASYSHIP_API_URL", "EASYSHIP_WEBHOOK_SECRET",
    "EXCHANGERATE_API_KEY", "FREECURRENCY_API_KEY",
    # Stripe
    "STRIPE_SECRET_KEY", "STRIPE_CONNECT_CLIENT_ID", "STRIPE_CONNECT_WEBHOOK_SECRET",
    "STRIPE_WEBHOOK_SECRET", "STRIPE_PRICE_ID_ENTERPRISE_MONTHLY",
    "STRIPE_PRICE_ID_ENTERPRISE_YEARLY", "STRIPE_PRICE_ID_PRO_MONTHLY",
    "STRIPE_PRICE_ID_PRO_YEARLY",
    # MinIO/S3
    "MINIO_ACCESS_KEY", "MINIO_SECRET_KEY", "MINIO_ENDPOINT",
    "MINIO_BUCKET", "MINIO_TEMP_BUCKET", "MINIO_PUBLIC_DOMAIN",
    # OAuth
    "OAUTH_CLIENT_ID", "OAUTH_CLIENT_SECRET",
    # URLs (引用展开)
    "PUBLIC_URL", "PUBLIC_BASE_URL", "USER_AUTH_URL", "OAUTH_ISSUER",
    "COMMERCE_API_URL", "API_BASE_URL", "BACKEND_URL", "STORE_DOMAIN",
    "MCP_HOST_URL", "DEVICE_VERIFICATION_URI",
    "NEXT_PUBLIC_BASE_URL", "NEXT_PUBLIC_USER_AUTH_URL",
    "NEXT_PUBLIC_COMMERCE_BACKEND_URL", "NEXT_PUBLIC_SHOP_DOMAIN",
    "NEXT_PUBLIC_AUTH_URL", "NEXT_PUBLIC_API_BASE_URL",
    # Email
    "RESEND_FROM_EMAIL", "RESEND_FROM_NAME", "RESEND_REPLY_TO",
    "EMAIL_HOST", "EMAIL_PORT", "EMAIL_USER", "EMAIL_PASS", "EMAIL_FROM",
    # 其他引用
    "CORS_ORIGINS",
}


def parse_env_file(path: Path) -> Dict[str, str]:
    """解析 .env 文件"""
    result = {}
    if not path.exists():
        return result

    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if "=" in line:
                key, value = line.split("=", 1)
                result[key.strip()] = value.strip()
    return result


def compare_configs(expanded: Dict[str, str], archive: Dict[str, str]) -> dict:
    """对比配置"""
    result = {
        "matched": [],          # 完全匹配
        "expected_diff": [],    # 预期差异（引用展开）
        "unexpected_diff": [],  # 意外差异
        "only_expanded": [],    # 只在 expanded 中
        "only_archive": [],     # 只在 archive 中
    }

    all_keys = set(expanded.keys()) | set(archive.keys())

    for key in all_keys:
        exp_val = expanded.get(key)
        arc_val = archive.get(key)

        if exp_val is None:
            result["only_archive"].append((key, arc_val))
        elif arc_val is None:
            result["only_expanded"].append((key, exp_val))
        elif exp_val == arc_val:
            result["matched"].append(key)
        elif key in EXPECTED_DIFF_KEYS:
            result["expected_diff"].append((key, arc_val, exp_val))
        else:
            result["unexpected_diff"].append((key, arc_val, exp_val))

    return result


def main():
    print("=" * 70)
    print("Infisical Expanded vs Archive-v2 对比")
    print("=" * 70)

    verbose = "-v" in sys.argv
    total_issues = 0

    for service in SERVICES:
        for env in ["prod", "staging"]:
            # expanded 文件路径
            exp_file = EXPANDED_DIR / service / env / f"EXPANDED_{service.upper().replace('-', '_')}_{env.upper()}.env"

            # archive-v2 文件路径
            arc_file = ARCHIVE_V2_DIR / service / env / f"INFISICAL_{service.upper().replace('-', '_')}_{env.upper()}.env"

            if not exp_file.exists():
                continue
            if not arc_file.exists():
                print(f"\n⚠️  {service}/{env}: archive-v2 文件不存在")
                continue

            expanded = parse_env_file(exp_file)
            archive = parse_env_file(arc_file)

            result = compare_configs(expanded, archive)

            # 输出
            has_issues = result["unexpected_diff"] or result["only_archive"]

            print(f"\n{'='*70}")
            print(f"📦 {service} / {env}")
            print(f"{'='*70}")
            print(f"  ✅ 匹配: {len(result['matched'])} 项")
            print(f"  🔄 预期差异（引用展开）: {len(result['expected_diff'])} 项")
            print(f"  ➕ 只在 Infisical: {len(result['only_expanded'])} 项")

            if result["unexpected_diff"]:
                print(f"  ⚠️  意外差异: {len(result['unexpected_diff'])} 项")
                for key, arc_val, exp_val in result["unexpected_diff"]:
                    print(f"      {key}:")
                    print(f"        archive-v2: {arc_val[:60]}..." if len(arc_val) > 60 else f"        archive-v2: {arc_val}")
                    print(f"        expanded:   {exp_val[:60]}..." if len(exp_val) > 60 else f"        expanded:   {exp_val}")
                total_issues += len(result["unexpected_diff"])

            if result["only_archive"]:
                print(f"  ❌ archive-v2 有但 Infisical 缺失: {len(result['only_archive'])} 项")
                for key, val in result["only_archive"]:
                    print(f"      {key} = {val[:60]}..." if len(str(val)) > 60 else f"      {key} = {val}")
                total_issues += len(result["only_archive"])

            if result["only_expanded"] and verbose:
                print(f"  ➕ Infisical 有但 archive-v2 没有:")
                for key, val in result["only_expanded"]:
                    print(f"      {key} = {val[:60]}..." if len(str(val)) > 60 else f"      {key} = {val}")

            if verbose and result["expected_diff"]:
                print(f"  🔄 预期差异详情:")
                for key, arc_val, exp_val in result["expected_diff"]:
                    print(f"      {key}:")
                    print(f"        archive-v2: {arc_val[:50]}..." if len(arc_val) > 50 else f"        archive-v2: {arc_val}")
                    print(f"        expanded:   {exp_val[:50]}..." if len(exp_val) > 50 else f"        expanded:   {exp_val}")

    print(f"\n{'='*70}")
    if total_issues == 0:
        print("✅ 所有配置验证通过！Infisical 展开后与 archive-v2 一致")
    else:
        print(f"⚠️  发现 {total_issues} 个需要检查的差异")
    print("=" * 70)
    print("\n提示: 使用 -v 参数查看详细差异")


if __name__ == "__main__":
    main()
