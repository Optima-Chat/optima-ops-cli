#!/usr/bin/env python3
"""
对比 Infisical 新版本配置和 archive 旧版本配置
验证迁移后的值是否正确
"""

import os
import sys
import re
from pathlib import Path
from typing import Dict, Optional
import requests
import yaml

# =============================================================================
# 配置
# =============================================================================

BASE_DIR = Path(__file__).parent.parent
CONFIG_FILE = BASE_DIR / "config.local.yaml"
ARCHIVE_DIR = BASE_DIR / "archive" / "services"

# 服务映射: archive 文件名 -> (环境, 服务名)
SERVICE_MAPPINGS = {
    # 核心服务
    "user-auth": {
        "prod": "INFISICAL_USER_AUTH_PROD.env",
        "staging": "INFISICAL_USER_AUTH_STAGING.env",
    },
    "commerce-backend": {
        "prod": "INFISICAL_COMMERCE_BACKEND_PROD.env",
        "staging": "INFISICAL_COMMERCE_BACKEND_STAGING.env",
    },
    "agentic-chat": {
        "prod": "INFISICAL_AGENTIC_CHAT_PROD.env",
        "staging": "INFISICAL_AGENTIC_CHAT_STAGING.env",
    },
    "mcp-host": {
        "prod": "INFISICAL_MCP_HOST_PROD.env",
        "staging": "INFISICAL_MCP_HOST_STAGING.env",
    },
    # MCP 工具
    "comfy-mcp": {
        "prod": "INFISICAL_COMFY_MCP_PROD.env",
        "staging": "INFISICAL_COMFY_MCP_STAGING.env",
    },
    "fetch-mcp": {
        "prod": "INFISICAL_FETCH_MCP_PROD.env",
        "staging": "INFISICAL_FETCH_MCP_STAGING.env",
    },
    "perplexity-mcp": {
        "prod": "INFISICAL_PERPLEXITY_MCP_PROD.env",
        "staging": "INFISICAL_PERPLEXITY_MCP_STAGING.env",
    },
    "shopify-mcp": {
        "prod": "INFISICAL_SHOPIFY_MCP_PROD.env",
        "staging": "INFISICAL_SHOPIFY_MCP_STAGING.env",
    },
    "chart-mcp": {
        "prod": "INFISICAL_CHART_MCP_PROD.env",
        "staging": "INFISICAL_CHART_MCP_STAGING.env",
    },
    "commerce-mcp": {
        "prod": "INFISICAL_COMMERCE_MCP_PROD.env",
        "staging": "INFISICAL_COMMERCE_MCP_STAGING.env",
    },
    "google-ads-mcp": {
        "prod": "INFISICAL_GOOGLE_ADS_MCP_PROD.env",
        "staging": "INFISICAL_GOOGLE_ADS_MCP_STAGING.env",
    },
}

# 预期会变化的 key（域名相关）
EXPECTED_CHANGES = {
    "PUBLIC_URL", "PUBLIC_BASE_URL", "USER_AUTH_URL", "OAUTH_ISSUER",
    "COMMERCE_API_URL", "API_BASE_URL", "NEXT_PUBLIC_BASE_URL",
    "NEXT_PUBLIC_USER_AUTH_URL", "NEXT_PUBLIC_COMMERCE_BACKEND_URL",
    "NEXT_PUBLIC_SHOP_DOMAIN", "CORS_ORIGINS",
    # 容器名等
    "CONTAINER_NAME", "APP_NAME",
    # 新旧命名差异
    "COMFY_MCP_PUBLIC_URL", "FETCH_MCP_PUBLIC_URL", "PERPLEXITY_MCP_PUBLIC_URL",
    "SHOPIFY_MCP_PUBLIC_URL", "CHART_MCP_PUBLIC_URL", "COMMERCE_MCP_PUBLIC_URL",
    "GOOGLE_ADS_MCP_PUBLIC_URL",
    # 域名迁移 (optima.shop -> optima.onl)
    "STORE_DOMAIN", "SHOP_DOMAIN",
    # Staging 环境预期用不同值
    "DATABASE_URL", "REDIS_URL", "DB_USER", "DB_PASSWORD", "DB_NAME",
    "OAUTH_CLIENT_ID", "OAUTH_CLIENT_SECRET", "SECRET_KEY", "SESSION_SECRET",
    "APP_SECRET", "EMAIL_PASSWORD_SECRET", "NODE_ENV", "LOG_LEVEL",
    # 内部通信端口标准化 (8280 -> 8200)
    "BACKEND_URL",
    # Email 配置变化 (从 feishu 到 resend)
    "EMAIL_HOST", "EMAIL_PORT", "EMAIL_USER", "EMAIL_PASS", "EMAIL_FROM",
    "EMAIL_SECURE",
    # API Key 展开后的值
    "ANTHROPIC_API_KEY", "OPENAI_API_KEY", "PERPLEXITY_API_KEY",
}

# =============================================================================
# Infisical 客户端
# =============================================================================

class InfisicalClient:
    def __init__(self, server: str, client_id: str, client_secret: str, project_id: str):
        self.server = server.rstrip("/")
        self.client_id = client_id
        self.client_secret = client_secret
        self.project_id = project_id
        self._token: Optional[str] = None

    @property
    def token(self) -> str:
        if self._token is None:
            resp = requests.post(
                f"{self.server}/api/v1/auth/universal-auth/login",
                json={"clientId": self.client_id, "clientSecret": self.client_secret}
            )
            resp.raise_for_status()
            self._token = resp.json()["accessToken"]
        return self._token

    def _headers(self) -> dict:
        return {"Authorization": f"Bearer {self.token}", "Content-Type": "application/json"}

    def get_secrets(self, environment: str, path: str = "/", expand: bool = True) -> Dict[str, str]:
        """获取 secrets，展开引用"""
        resp = requests.get(
            f"{self.server}/api/v3/secrets/raw",
            headers=self._headers(),
            params={
                "workspaceId": self.project_id,
                "environment": environment,
                "secretPath": path,
                "expandSecretReferences": "true" if expand else "false",
            }
        )
        resp.raise_for_status()
        secrets = resp.json().get("secrets", [])
        return {s["secretKey"]: s["secretValue"] for s in secrets}


# =============================================================================
# 工具函数
# =============================================================================

def load_config() -> dict:
    with open(CONFIG_FILE) as f:
        return yaml.safe_load(f)


def parse_env_file(env_file: Path) -> Dict[str, str]:
    """解析 .env 文件"""
    secrets = {}
    if not env_file.exists():
        return secrets

    with open(env_file) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if "=" in line:
                key, value = line.split("=", 1)
                key = key.strip()
                value = value.strip()
                # 移除服务前缀 (如 COMFY_MCP_MCP_HOST -> MCP_HOST)
                # 但保留一些特殊的前缀
                if key:
                    secrets[key] = value
    return secrets


def normalize_key(key: str, service_name: str) -> str:
    """规范化 key 名称，移除服务前缀"""
    prefixes = [
        f"{service_name.upper().replace('-', '_')}_",
        "COMFY_MCP_", "FETCH_MCP_", "PERPLEXITY_MCP_",
        "SHOPIFY_MCP_", "CHART_MCP_", "COMMERCE_MCP_",
        "GOOGLE_ADS_MCP_",
    ]

    for prefix in prefixes:
        if key.startswith(prefix):
            return key[len(prefix):]
    return key


def compare_configs(old_config: Dict[str, str], new_config: Dict[str, str],
                   service_name: str, env: str) -> dict:
    """对比新旧配置"""
    result = {
        "matched": [],      # 值相同的
        "changed": [],      # 值不同的
        "expected_change": [],  # 预期会变的
        "only_old": [],     # 只在旧版本有
        "only_new": [],     # 只在新版本有
    }

    # 规范化旧配置的 key
    old_normalized = {}
    for k, v in old_config.items():
        norm_key = normalize_key(k, service_name)
        old_normalized[norm_key] = (k, v)

    # 对比
    for new_key, new_val in new_config.items():
        if new_key in old_normalized:
            old_key, old_val = old_normalized[new_key]
            if old_val == new_val:
                result["matched"].append((new_key, new_val))
            elif new_key in EXPECTED_CHANGES or old_key in EXPECTED_CHANGES:
                result["expected_change"].append((new_key, old_val, new_val))
            else:
                result["changed"].append((new_key, old_val, new_val))
            del old_normalized[new_key]
        else:
            result["only_new"].append((new_key, new_val))

    # 剩余的只在旧版本有
    for norm_key, (orig_key, val) in old_normalized.items():
        result["only_old"].append((orig_key, val))

    return result


# =============================================================================
# 主函数
# =============================================================================

def main():
    config = load_config()
    infisical_config = config.get("infisical", {})

    client = InfisicalClient(
        server=infisical_config["server"],
        client_id=infisical_config["client_id"],
        client_secret=infisical_config["client_secret"],
        project_id=infisical_config["project_id"]
    )

    print("=" * 70)
    print("Infisical 新旧配置对比")
    print("=" * 70)

    total_issues = 0

    for service_name, env_files in SERVICE_MAPPINGS.items():
        for env, archive_filename in env_files.items():
            # 读取 archive 旧配置
            archive_path = ARCHIVE_DIR / service_name / env / archive_filename
            if not archive_path.exists():
                continue

            old_config = parse_env_file(archive_path)

            # 从 Infisical 获取新配置 (展开引用)
            try:
                new_config = client.get_secrets(env, f"/services/{service_name}", expand=True)
            except Exception as e:
                print(f"\n⚠️  {service_name}/{env}: 无法获取 - {e}")
                continue

            if not new_config:
                continue

            # 对比
            result = compare_configs(old_config, new_config, service_name, env)

            # 输出结果
            has_issues = result["changed"] or result["only_old"]

            print(f"\n{'='*70}")
            print(f"📦 {service_name} / {env}")
            print(f"{'='*70}")
            print(f"  ✅ 匹配: {len(result['matched'])} 项")
            print(f"  🔄 预期变化: {len(result['expected_change'])} 项")
            print(f"  ➕ 新增: {len(result['only_new'])} 项")

            if result["changed"]:
                print(f"  ⚠️  意外变化: {len(result['changed'])} 项")
                for key, old_val, new_val in result["changed"]:
                    print(f"      {key}:")
                    print(f"        旧: {old_val[:50]}..." if len(old_val) > 50 else f"        旧: {old_val}")
                    print(f"        新: {new_val[:50]}..." if len(new_val) > 50 else f"        新: {new_val}")
                total_issues += len(result["changed"])

            if result["only_old"]:
                print(f"  ❌ 缺失: {len(result['only_old'])} 项")
                for key, val in result["only_old"]:
                    print(f"      {key} = {val[:50]}..." if len(val) > 50 else f"      {key} = {val}")
                total_issues += len(result["only_old"])

            # 显示预期变化详情
            if result["expected_change"] and "-v" in sys.argv:
                print(f"  🔄 预期变化详情:")
                for key, old_val, new_val in result["expected_change"]:
                    print(f"      {key}:")
                    print(f"        旧: {old_val[:60]}..." if len(old_val) > 60 else f"        旧: {old_val}")
                    print(f"        新: {new_val[:60]}..." if len(new_val) > 60 else f"        新: {new_val}")

    print(f"\n{'='*70}")
    if total_issues == 0:
        print("✅ 所有配置验证通过！")
    else:
        print(f"⚠️  发现 {total_issues} 个潜在问题需要检查")
    print("=" * 70)
    print("\n提示: 使用 -v 参数查看预期变化的详情")


if __name__ == "__main__":
    main()
