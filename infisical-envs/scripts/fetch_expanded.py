#!/usr/bin/env python3
"""
从 Infisical 拉取展开后的配置，保存到 expanded/ 目录
用于与 archive-v2 对比验证
"""

import os
import sys
from pathlib import Path
from typing import Dict, Optional
import requests
import yaml

BASE_DIR = Path(__file__).parent.parent
CONFIG_FILE = BASE_DIR / "config.local.yaml"
OUTPUT_DIR = BASE_DIR / "expanded"

# 服务列表
SERVICES = [
    "user-auth", "mcp-host", "commerce-backend", "agentic-chat",
    "comfy-mcp", "fetch-mcp", "perplexity-mcp", "shopify-mcp",
    "chart-mcp", "commerce-mcp", "google-ads-mcp"
]

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


def load_config() -> dict:
    with open(CONFIG_FILE) as f:
        return yaml.safe_load(f)


def main():
    config = load_config()
    infisical_config = config.get("infisical", {})

    client = InfisicalClient(
        server=infisical_config["server"],
        client_id=infisical_config["client_id"],
        client_secret=infisical_config["client_secret"],
        project_id=infisical_config["project_id"]
    )

    print("=" * 60)
    print("从 Infisical 拉取展开后的配置")
    print("=" * 60)

    # 创建输出目录
    OUTPUT_DIR.mkdir(exist_ok=True)

    for service in SERVICES:
        print(f"\n📦 {service}")

        for env in ["prod", "staging"]:
            try:
                # 获取 common 配置
                common_secrets = client.get_secrets("common", f"/services/{service}", expand=True)

                # 获取环境特定配置
                env_secrets = client.get_secrets(env, f"/services/{service}", expand=True)

                # 合并 (env 覆盖 common)
                merged = {**common_secrets, **env_secrets}

                if not merged:
                    print(f"  {env}: 无数据")
                    continue

                # 保存到文件
                output_dir = OUTPUT_DIR / service / env
                output_dir.mkdir(parents=True, exist_ok=True)
                output_file = output_dir / f"EXPANDED_{service.upper().replace('-', '_')}_{env.upper()}.env"

                with open(output_file, "w") as f:
                    f.write(f"# {service} / {env} - Infisical 展开后配置\n")
                    f.write(f"# 自动生成，用于与 archive-v2 对比\n\n")
                    for key in sorted(merged.keys()):
                        value = merged[key]
                        f.write(f"{key}={value}\n")

                print(f"  {env}: {len(merged)} 项 -> {output_file.relative_to(BASE_DIR)}")

            except Exception as e:
                print(f"  {env}: 错误 - {e}")

    print("\n" + "=" * 60)
    print(f"完成！配置已保存到 {OUTPUT_DIR.relative_to(BASE_DIR)}/")
    print("=" * 60)


if __name__ == "__main__":
    main()
