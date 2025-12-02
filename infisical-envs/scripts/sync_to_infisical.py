#!/usr/bin/env python3
"""
Infisical 环境变量同步脚本
将 v2/ 目录下的 .env 文件同步到 Infisical

使用方法:
    python scripts/sync_to_infisical.py --dry-run    # 预览操作
    python scripts/sync_to_infisical.py              # 执行同步
    python scripts/sync_to_infisical.py --step=1     # 只执行第1步
"""

import os
import sys
import json
import argparse
import re
from pathlib import Path
from typing import Optional
import requests
import yaml

# =============================================================================
# 配置
# =============================================================================

BASE_DIR = Path(__file__).parent.parent
CONFIG_FILE = BASE_DIR / "config.local.yaml"
V2_DIR = BASE_DIR / "v2"

# =============================================================================
# Infisical API 客户端
# =============================================================================

class InfisicalClient:
    """Infisical API 客户端"""

    def __init__(self, server: str, client_id: str, client_secret: str, project_id: str):
        self.server = server.rstrip("/")
        self.client_id = client_id
        self.client_secret = client_secret
        self.project_id = project_id
        self._token: Optional[str] = None

    @property
    def token(self) -> str:
        """获取或刷新 access token"""
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

    # -------------------------------------------------------------------------
    # 项目和环境
    # -------------------------------------------------------------------------

    def get_project(self) -> dict:
        """获取项目详情"""
        resp = requests.get(
            f"{self.server}/api/v1/workspace/{self.project_id}",
            headers=self._headers()
        )
        resp.raise_for_status()
        return resp.json()["workspace"]

    def list_environments(self) -> list:
        """列出项目所有环境"""
        project = self.get_project()
        return project.get("environments", [])

    def create_environment(self, name: str, slug: str, position: int = 1) -> dict:
        """创建环境"""
        resp = requests.post(
            f"{self.server}/api/v1/projects/{self.project_id}/environments",
            headers=self._headers(),
            json={"name": name, "slug": slug, "position": position}
        )
        resp.raise_for_status()
        return resp.json()

    def delete_environment(self, slug: str) -> dict:
        """删除环境"""
        resp = requests.delete(
            f"{self.server}/api/v1/projects/{self.project_id}/environments/{slug}",
            headers=self._headers()
        )
        resp.raise_for_status()
        return resp.json()

    # -------------------------------------------------------------------------
    # 文件夹
    # -------------------------------------------------------------------------

    def list_folders(self, environment: str, path: str = "/") -> list:
        """列出文件夹"""
        resp = requests.get(
            f"{self.server}/api/v1/folders",
            headers=self._headers(),
            params={
                "workspaceId": self.project_id,
                "environment": environment,
                "path": path
            }
        )
        resp.raise_for_status()
        return resp.json().get("folders", [])

    def create_folder(self, environment: str, name: str, path: str = "/") -> dict:
        """创建文件夹"""
        resp = requests.post(
            f"{self.server}/api/v1/folders",
            headers=self._headers(),
            json={
                "workspaceId": self.project_id,
                "environment": environment,
                "name": name,
                "path": path
            }
        )
        resp.raise_for_status()
        return resp.json()

    def delete_folder(self, environment: str, folder_id: str, parent_path: str = "/") -> dict:
        """删除文件夹"""
        resp = requests.delete(
            f"{self.server}/api/v1/folders/{folder_id}",
            headers=self._headers(),
            json={
                "workspaceId": self.project_id,
                "environment": environment,
                "directory": parent_path
            }
        )
        resp.raise_for_status()
        return resp.json()

    def delete_folder_recursive(self, environment: str, folder_path: str) -> bool:
        """递归删除文件夹（先删除内部内容）"""
        folder_path = folder_path.rstrip("/")
        if not folder_path or folder_path == "/":
            return False

        # 1. 先删除该路径下的所有 secret imports
        try:
            self.delete_all_secret_imports(environment, folder_path)
        except Exception:
            pass

        # 2. 删除该路径下的所有 secrets
        try:
            secrets = self.list_secrets(environment, folder_path)
            for secret in secrets:
                try:
                    self.delete_secret(environment, secret["secretKey"], folder_path)
                except Exception:
                    pass  # 忽略单个 secret 删除失败
        except Exception:
            pass  # 文件夹可能不存在

        # 3. 递归删除子文件夹
        try:
            subfolders = self.list_folders(environment, folder_path)
            for subfolder in subfolders:
                sub_path = f"{folder_path}/{subfolder['name']}"
                self.delete_folder_recursive(environment, sub_path)
        except Exception:
            pass

        # 4. 删除当前文件夹
        # 解析路径获取父目录和文件夹名
        if "/" in folder_path.strip("/"):
            parent_path = "/" + "/".join(folder_path.strip("/").split("/")[:-1])
            folder_name = folder_path.strip("/").split("/")[-1]
        else:
            parent_path = "/"
            folder_name = folder_path.strip("/")

        # 列出父目录下的文件夹找到 ID
        folders = self.list_folders(environment, parent_path)
        for f in folders:
            if f["name"] == folder_name:
                self.delete_folder(environment, f["id"], parent_path)
                return True
        return False

    def delete_folder_by_path(self, environment: str, folder_path: str) -> bool:
        """通过路径删除文件夹（递归删除内容后删除文件夹）"""
        return self.delete_folder_recursive(environment, folder_path)

    def ensure_folder_path(self, environment: str, folder_path: str) -> None:
        """确保文件夹路径存在（递归创建）"""
        if folder_path == "/" or not folder_path:
            return

        parts = folder_path.strip("/").split("/")
        current_path = "/"

        for part in parts:
            existing = self.list_folders(environment, current_path)
            existing_names = [f["name"] for f in existing]

            if part not in existing_names:
                self.create_folder(environment, part, current_path)
                print(f"  ✓ 创建文件夹: {environment} {current_path}{part}")

            current_path = f"{current_path}{part}/"

    # -------------------------------------------------------------------------
    # Secrets
    # -------------------------------------------------------------------------

    def list_secrets(self, environment: str, path: str = "/") -> list:
        """列出 secrets"""
        resp = requests.get(
            f"{self.server}/api/v3/secrets/raw",
            headers=self._headers(),
            params={
                "workspaceId": self.project_id,
                "environment": environment,
                "secretPath": path
            }
        )
        resp.raise_for_status()
        return resp.json().get("secrets", [])

    def create_secret(self, environment: str, key: str, value: str, path: str = "/",
                      secret_type: str = "shared") -> dict:
        """创建单个 secret"""
        resp = requests.post(
            f"{self.server}/api/v3/secrets/raw/{key}",
            headers=self._headers(),
            json={
                "workspaceId": self.project_id,
                "environment": environment,
                "secretPath": path,
                "secretValue": value,
                "type": secret_type
            }
        )
        resp.raise_for_status()
        return resp.json()

    def update_secret(self, environment: str, key: str, value: str, path: str = "/",
                      secret_type: str = "shared") -> dict:
        """更新单个 secret"""
        resp = requests.patch(
            f"{self.server}/api/v3/secrets/raw/{key}",
            headers=self._headers(),
            json={
                "workspaceId": self.project_id,
                "environment": environment,
                "secretPath": path,
                "secretValue": value,
                "type": secret_type
            }
        )
        resp.raise_for_status()
        return resp.json()

    def delete_secret(self, environment: str, key: str, path: str = "/",
                      secret_type: str = "shared") -> dict:
        """删除单个 secret"""
        resp = requests.delete(
            f"{self.server}/api/v3/secrets/raw/{key}",
            headers=self._headers(),
            json={
                "workspaceId": self.project_id,
                "environment": environment,
                "secretPath": path,
                "type": secret_type
            }
        )
        resp.raise_for_status()
        return resp.json()

    def set_secrets_from_env(self, environment: str, env_file: Path, path: str = "/",
                             dry_run: bool = False) -> dict:
        """从 .env 文件导入 secrets，返回统计信息"""
        secrets = parse_env_file(env_file)
        if not secrets:
            return {"created": 0, "updated": 0, "unchanged": 0, "failed": 0}

        # 获取现有 secrets
        existing = {s["secretKey"]: s for s in self.list_secrets(environment, path)}

        stats = {"created": 0, "updated": 0, "unchanged": 0, "failed": 0}
        for key, value in secrets.items():
            try:
                if key in existing:
                    # 检查是否需要更新
                    if existing[key].get("secretValue") != value:
                        if dry_run:
                            print(f"    ↻ [将更新] {key}")
                        else:
                            self.update_secret(environment, key, value, path)
                            print(f"    ↻ 更新: {key}")
                        stats["updated"] += 1
                    else:
                        stats["unchanged"] += 1
                else:
                    # 创建
                    if dry_run:
                        print(f"    + [将创建] {key}")
                    else:
                        self.create_secret(environment, key, value, path)
                        print(f"    + 创建: {key}")
                    stats["created"] += 1
            except Exception as e:
                print(f"    ✗ 失败 {key}: {e}")
                stats["failed"] += 1

        return stats

    # -------------------------------------------------------------------------
    # Secret Imports
    # -------------------------------------------------------------------------

    def list_secret_imports(self, environment: str, path: str = "/") -> list:
        """列出 secret imports"""
        resp = requests.get(
            f"{self.server}/api/v1/secret-imports",
            headers=self._headers(),
            params={
                "workspaceId": self.project_id,
                "environment": environment,
                "path": path
            }
        )
        resp.raise_for_status()
        return resp.json().get("secretImports", [])

    def create_secret_import(self, environment: str, path: str,
                              import_env: str, import_path: str) -> dict:
        """创建 secret import"""
        resp = requests.post(
            f"{self.server}/api/v2/secret-imports",
            headers=self._headers(),
            json={
                "projectId": self.project_id,
                "environment": environment,
                "path": path,
                "import": {
                    "environment": import_env,
                    "path": import_path
                }
            }
        )
        resp.raise_for_status()
        return resp.json()

    def delete_secret_import(self, environment: str, path: str, import_id: str) -> dict:
        """删除 secret import"""
        resp = requests.delete(
            f"{self.server}/api/v1/secret-imports/{import_id}",
            headers=self._headers(),
            params={
                "workspaceId": self.project_id,
                "environment": environment,
                "path": path
            }
        )
        resp.raise_for_status()
        return resp.json()

    def delete_all_secret_imports(self, environment: str, path: str) -> int:
        """删除指定路径下的所有 secret imports"""
        imports = self.list_secret_imports(environment, path)
        count = 0
        for imp in imports:
            try:
                self.delete_secret_import(environment, path, imp["id"])
                count += 1
            except Exception:
                pass
        return count

    def ensure_secret_import(self, environment: str, path: str,
                              import_env: str, import_path: str) -> bool:
        """确保 secret import 存在"""
        existing = self.list_secret_imports(environment, path)

        for imp in existing:
            if (imp.get("importEnv", {}).get("slug") == import_env and
                imp.get("importPath") == import_path):
                return False  # 已存在

        self.create_secret_import(environment, path, import_env, import_path)
        return True


# =============================================================================
# 工具函数
# =============================================================================

def load_config() -> dict:
    """加载配置"""
    if not CONFIG_FILE.exists():
        print(f"错误: 配置文件不存在: {CONFIG_FILE}")
        sys.exit(1)

    with open(CONFIG_FILE) as f:
        return yaml.safe_load(f)


def parse_env_file(env_file: Path) -> dict:
    """解析 .env 文件，忽略注释和空行"""
    secrets = {}

    with open(env_file) as f:
        for line in f:
            line = line.strip()
            # 跳过空行和注释
            if not line or line.startswith("#"):
                continue
            # 解析 KEY=VALUE
            if "=" in line:
                key, value = line.split("=", 1)
                key = key.strip()
                value = value.strip()
                # 跳过空 key
                if key:
                    secrets[key] = value

    return secrets


# =============================================================================
# 同步逻辑
# =============================================================================

def step1_setup_environments(client: InfisicalClient, dry_run: bool = False) -> None:
    """Step 1: 设置环境 (common, prod, staging)"""
    print("\n" + "="*60)
    print("Step 1: 设置环境")
    print("="*60)

    target_envs = [
        {"name": "Common", "slug": "common", "position": 1},
        {"name": "Production", "slug": "prod", "position": 2},
        {"name": "Staging", "slug": "staging", "position": 3},
    ]

    existing = client.list_environments()
    existing_slugs = {e["slug"] for e in existing}

    # 删除默认的 dev 环境
    if "dev" in existing_slugs:
        if dry_run:
            print("  [DRY-RUN] 删除环境: dev")
        else:
            try:
                client.delete_environment("dev")
                print("  ✓ 删除环境: dev")
            except Exception as e:
                print(f"  ✗ 删除 dev 失败: {e}")

    for env in target_envs:
        if env["slug"] in existing_slugs:
            print(f"  - 环境已存在: {env['name']} ({env['slug']})")
        else:
            if dry_run:
                print(f"  [DRY-RUN] 创建环境: {env['name']} ({env['slug']})")
            else:
                client.create_environment(env["name"], env["slug"], env["position"])
                print(f"  ✓ 创建环境: {env['name']} ({env['slug']})")


def import_env_files_recursive(client: InfisicalClient, base_dir: Path, environment: str,
                                base_path: str = "/", dry_run: bool = False) -> dict:
    """递归导入目录下所有 .env 文件到 Infisical

    目录结构映射规则:
    - base_dir/*.env -> environment:base_path/
    - base_dir/subdir/*.env -> environment:base_path/subdir/
    - base_dir/subdir/nested/*.env -> environment:base_path/subdir/nested/

    特殊规则: 文件名作为子路径的一部分
    - third-party-apis/anthropic.env -> /third-party-apis/anthropic
    - clickhouse/bi.env -> /clickhouse/bi

    返回统计信息
    """
    total_stats = {"created": 0, "updated": 0, "unchanged": 0, "failed": 0}

    if not base_dir.exists():
        return total_stats

    # 处理当前目录的 .env 文件
    for env_file in sorted(base_dir.glob("*.env")):
        # 计算目标路径：始终使用文件名（不含扩展名）作为路径的一部分
        # 例如: database-users.env -> /database-users
        #       clickhouse/bi.env -> /clickhouse/bi
        folder_name = env_file.stem
        if base_path == "/":
            target_path = f"/{folder_name}"
        else:
            target_path = f"{base_path.rstrip('/')}/{folder_name}"

        print(f"\n  导入: {env_file.relative_to(base_dir.parent.parent)} -> {environment}:{target_path}")
        client.ensure_folder_path(environment, target_path)
        stats = client.set_secrets_from_env(environment, env_file, target_path, dry_run)

        # 汇总统计
        for k in total_stats:
            total_stats[k] += stats[k]

        # 显示统计摘要
        if stats["unchanged"] > 0 and stats["created"] == 0 and stats["updated"] == 0:
            print(f"    ✓ {stats['unchanged']} 个变量无变化")
        elif stats["unchanged"] > 0:
            print(f"    - {stats['unchanged']} 个变量无变化")

    # 递归处理子目录
    for subdir in sorted(base_dir.iterdir()):
        if subdir.is_dir():
            sub_path = f"{base_path.rstrip('/')}/{subdir.name}"
            sub_stats = import_env_files_recursive(client, subdir, environment, sub_path, dry_run)
            for k in total_stats:
                total_stats[k] += sub_stats[k]

    return total_stats


def step2_import_shared_secrets(client: InfisicalClient, dry_run: bool = False) -> None:
    """Step 2: 导入 shared-secrets (递归处理所有目录)"""
    print("\n" + "="*60)
    print("Step 2: 导入 shared-secrets")
    print("="*60)

    shared_dir = V2_DIR / "shared-secrets"

    # 环境映射: 目录名 -> Infisical 环境 slug
    env_mapping = {
        "common": "common",
        "prod": "prod",
        "staging": "staging"
    }

    grand_total = {"created": 0, "updated": 0, "unchanged": 0, "failed": 0}

    for dir_name, env_slug in env_mapping.items():
        env_dir = shared_dir / dir_name
        if env_dir.exists():
            print(f"\n[{env_slug} 环境]")
            # shared-secrets 目录下的内容放在 /shared-secrets/ 路径下
            stats = import_env_files_recursive(client, env_dir, env_slug, "/shared-secrets", dry_run)
            for k in grand_total:
                grand_total[k] += stats[k]

    # 打印总结
    print(f"\n  📊 shared-secrets 汇总: 创建 {grand_total['created']}, 更新 {grand_total['updated']}, 无变化 {grand_total['unchanged']}, 失败 {grand_total['failed']}")


def import_service_env(client: InfisicalClient, env_file: Path, environment: str,
                       target_path: str, dry_run: bool = False) -> dict:
    """导入单个服务环境文件，返回统计"""
    print(f"\n  导入: {env_file.name} -> {environment}:{target_path}")
    client.ensure_folder_path(environment, target_path)
    stats = client.set_secrets_from_env(environment, env_file, target_path, dry_run)

    # 显示统计摘要
    if stats["unchanged"] > 0 and stats["created"] == 0 and stats["updated"] == 0:
        print(f"    ✓ {stats['unchanged']} 个变量无变化")
    elif stats["unchanged"] > 0:
        print(f"    - {stats['unchanged']} 个变量无变化")

    return stats


def import_service_dir(client: InfisicalClient, service_dir: Path, base_path: str,
                       dry_run: bool = False) -> tuple:
    """
    导入服务目录的配置文件
    返回: (处理过的服务列表, 统计信息)
    """
    processed = []
    total_stats = {"created": 0, "updated": 0, "unchanged": 0, "failed": 0}

    # 检查是否有 common.env（判断是否是叶子服务目录）
    common_env = service_dir / "common.env"
    prod_env = service_dir / "prod.env"
    staging_env = service_dir / "staging.env"

    if common_env.exists() or prod_env.exists() or staging_env.exists():
        # 这是一个服务目录，导入配置
        target_path = base_path

        if common_env.exists():
            stats = import_service_env(client, common_env, "common", target_path, dry_run)
            for k in total_stats:
                total_stats[k] += stats[k]

        if prod_env.exists():
            stats = import_service_env(client, prod_env, "prod", target_path, dry_run)
            for k in total_stats:
                total_stats[k] += stats[k]

        if staging_env.exists():
            stats = import_service_env(client, staging_env, "staging", target_path, dry_run)
            for k in total_stats:
                total_stats[k] += stats[k]

        processed.append({
            "path": target_path,
            "has_common": common_env.exists(),
            "has_prod": prod_env.exists(),
            "has_staging": staging_env.exists()
        })

    # 递归处理子目录
    for subdir in sorted(service_dir.iterdir()):
        if subdir.is_dir() and not subdir.name.startswith('.'):
            sub_path = f"{base_path}/{subdir.name}"
            sub_processed, sub_stats = import_service_dir(client, subdir, sub_path, dry_run)
            processed.extend(sub_processed)
            for k in total_stats:
                total_stats[k] += sub_stats[k]

    return processed, total_stats


def step3_import_services(client: InfisicalClient, dry_run: bool = False) -> list:
    """Step 3: 导入 services，返回处理过的服务列表"""
    print("\n" + "="*60)
    print("Step 3: 导入 services")
    print("="*60)

    services_dir = V2_DIR / "services"
    all_services = []
    grand_total = {"created": 0, "updated": 0, "unchanged": 0, "failed": 0}

    for service_dir in sorted(services_dir.iterdir()):
        if not service_dir.is_dir():
            continue

        service_name = service_dir.name
        print(f"\n[{service_name}]")

        base_path = f"/services/{service_name}"
        services, stats = import_service_dir(client, service_dir, base_path, dry_run)
        all_services.extend(services)
        for k in grand_total:
            grand_total[k] += stats[k]

    # 打印总结
    print(f"\n  📊 services 汇总: 创建 {grand_total['created']}, 更新 {grand_total['updated']}, 无变化 {grand_total['unchanged']}, 失败 {grand_total['failed']}")

    return all_services


def scan_services_for_imports(services_dir: Path) -> list:
    """扫描服务目录获取服务信息（用于 step4 单独运行时）"""
    def scan_dir(service_dir: Path, base_path: str) -> list:
        processed = []
        common_env = service_dir / "common.env"
        prod_env = service_dir / "prod.env"
        staging_env = service_dir / "staging.env"

        if common_env.exists() or prod_env.exists() or staging_env.exists():
            processed.append({
                "path": base_path,
                "has_common": common_env.exists(),
                "has_prod": prod_env.exists(),
                "has_staging": staging_env.exists()
            })

        for subdir in sorted(service_dir.iterdir()):
            if subdir.is_dir() and not subdir.name.startswith('.'):
                sub_path = f"{base_path}/{subdir.name}"
                processed.extend(scan_dir(subdir, sub_path))

        return processed

    all_services = []
    for service_dir in sorted(services_dir.iterdir()):
        if service_dir.is_dir():
            base_path = f"/services/{service_dir.name}"
            all_services.extend(scan_dir(service_dir, base_path))
    return all_services


def step4_setup_service_imports(client: InfisicalClient, services: list = None,
                                dry_run: bool = False) -> None:
    """Step 4: 设置服务的 Secret Imports (common -> prod/staging)"""
    print("\n" + "="*60)
    print("Step 4: 设置服务 Secret Imports")
    print("="*60)

    # 如果没有传入服务列表，重新扫描
    if services is None:
        services = scan_services_for_imports(V2_DIR / "services")

    stats = {"created": 0, "unchanged": 0}

    for svc in services:
        service_path = svc["path"]

        # 只处理有 common.env 的服务
        if not svc["has_common"]:
            continue

        # 提取服务名用于显示
        service_name = service_path.replace("/services/", "")
        print(f"\n[{service_name}]")

        # prod:/services/{service} <- import <- common:/services/{service}
        if svc["has_prod"]:
            if dry_run:
                # dry-run 时检查是否已存在
                existing = client.list_secret_imports("prod", service_path)
                already_exists = any(
                    imp.get("importEnv", {}).get("slug") == "common" and
                    imp.get("importPath") == service_path
                    for imp in existing
                )
                if already_exists:
                    print(f"  ✓ prod:{service_path} <- common:{service_path} (已存在)")
                    stats["unchanged"] += 1
                else:
                    print(f"  + [将创建] prod:{service_path} <- common:{service_path}")
                    stats["created"] += 1
            else:
                created = client.ensure_secret_import("prod", service_path, "common", service_path)
                if created:
                    print(f"  + 创建: prod:{service_path} <- common:{service_path}")
                    stats["created"] += 1
                else:
                    print(f"  ✓ prod:{service_path} <- common:{service_path} (已存在)")
                    stats["unchanged"] += 1

        # staging:/services/{service} <- import <- common:/services/{service}
        if svc["has_staging"]:
            if dry_run:
                existing = client.list_secret_imports("staging", service_path)
                already_exists = any(
                    imp.get("importEnv", {}).get("slug") == "common" and
                    imp.get("importPath") == service_path
                    for imp in existing
                )
                if already_exists:
                    print(f"  ✓ staging:{service_path} <- common:{service_path} (已存在)")
                    stats["unchanged"] += 1
                else:
                    print(f"  + [将创建] staging:{service_path} <- common:{service_path}")
                    stats["created"] += 1
            else:
                created = client.ensure_secret_import("staging", service_path, "common", service_path)
                if created:
                    print(f"  + 创建: staging:{service_path} <- common:{service_path}")
                    stats["created"] += 1
                else:
                    print(f"  ✓ staging:{service_path} <- common:{service_path} (已存在)")
                    stats["unchanged"] += 1

    # 打印总结
    print(f"\n  📊 Secret Imports 汇总: 创建 {stats['created']}, 已存在 {stats['unchanged']}")


# =============================================================================
# 精确同步（指定文件或路径）
# =============================================================================

def map_file_to_infisical(file_path: Path) -> tuple:
    """
    将本地文件路径映射到 Infisical 环境和路径

    示例:
        v2/shared-secrets/common/clickhouse.env -> ('common', '/shared-secrets/clickhouse')
        v2/shared-secrets/staging/database-users.env -> ('staging', '/shared-secrets/database-users')
        v2/services/bi/backend/common.env -> ('common', '/services/bi/backend')
        v2/services/bi/backend/staging.env -> ('staging', '/services/bi/backend')

    返回: (environment, infisical_path)
    """
    parts = file_path.parts

    # 找到 v2 的位置
    if "v2" not in parts:
        raise ValueError(f"文件不在 v2 目录下: {file_path}")

    v2_index = parts.index("v2")
    relative_parts = parts[v2_index + 1:]

    if len(relative_parts) < 2:
        raise ValueError(f"路径格式不正确: {file_path}")

    # shared-secrets 目录: v2/shared-secrets/{env}/{name}.env 或 v2/shared-secrets/{env}/subdir/{name}.env
    if relative_parts[0] == "shared-secrets":
        environment = relative_parts[1]  # common, prod, staging
        file_name = file_path.stem

        if len(relative_parts) > 3:
            # v2/shared-secrets/common/subdir/name.env -> /shared-secrets/subdir/name
            subdir_parts = relative_parts[2:-1]
            infisical_path = f"/shared-secrets/{'/'.join(subdir_parts)}/{file_name}"
        else:
            # v2/shared-secrets/common/name.env -> /shared-secrets/name
            infisical_path = f"/shared-secrets/{file_name}"

        return environment, infisical_path

    # services 目录: v2/services/{service}/.../{env}.env
    elif relative_parts[0] == "services":
        file_name = file_path.stem  # common, prod, staging

        if file_name not in ("common", "prod", "staging"):
            raise ValueError(f"服务配置文件名必须是 common/prod/staging.env: {file_path}")

        environment = file_name
        service_parts = relative_parts[:-1]  # 去掉文件名
        infisical_path = "/" + "/".join(service_parts)

        return environment, infisical_path

    else:
        raise ValueError(f"未知的目录结构: {file_path}")


def find_env_files_for_path(infisical_path: str, recursive: bool = False) -> list:
    """
    根据 Infisical 路径找到对应的本地 .env 文件

    示例:
        /services/bi/backend -> [
            v2/services/bi/backend/common.env,
            v2/services/bi/backend/staging.env,
            v2/services/bi/backend/prod.env
        ]
        /shared-secrets/clickhouse -> [
            v2/shared-secrets/common/clickhouse.env,
            v2/shared-secrets/staging/clickhouse.env,
            v2/shared-secrets/prod/clickhouse.env
        ]

    递归模式（recursive=True）:
        /services/bi -> [
            v2/services/bi/backend/*.env,
            v2/services/bi/dashboard/*.env,
            v2/services/bi/mcp/*.env,
            ...
        ]

    返回: [(file_path, environment, infisical_path), ...]
    """
    results = []
    path_parts = infisical_path.strip("/").split("/")

    if path_parts[0] == "services":
        # /services/xxx -> v2/services/xxx/{common,staging,prod}.env
        service_dir = V2_DIR / "/".join(path_parts)

        if recursive and service_dir.exists():
            # 递归查找所有 .env 文件
            for env_file in sorted(service_dir.rglob("*.env")):
                if env_file.name in ("common.env", "staging.env", "prod.env"):
                    env_name = env_file.stem
                    # 计算相对于 v2 的路径作为 Infisical 路径
                    rel_path = env_file.parent.relative_to(V2_DIR)
                    inf_path = "/" + str(rel_path).replace("\\", "/")
                    results.append((env_file, env_name, inf_path))
        else:
            for env_name in ["common", "staging", "prod"]:
                env_file = service_dir / f"{env_name}.env"
                if env_file.exists():
                    results.append((env_file, env_name, infisical_path))

    elif path_parts[0] == "shared-secrets":
        # /shared-secrets/xxx -> v2/shared-secrets/{common,staging,prod}/xxx.env
        secret_name = "/".join(path_parts[1:]) if len(path_parts) > 1 else ""

        if recursive:
            # 递归查找所有环境下的 .env 文件
            for env_name in ["common", "staging", "prod"]:
                env_dir = V2_DIR / "shared-secrets" / env_name
                if secret_name:
                    env_dir = env_dir / secret_name
                if env_dir.exists():
                    for env_file in sorted(env_dir.rglob("*.env")):
                        # 计算 Infisical 路径
                        rel_to_env = env_file.relative_to(V2_DIR / "shared-secrets" / env_name)
                        # 去掉 .env 后缀，文件名作为路径的一部分
                        inf_path = "/shared-secrets/" + str(rel_to_env.with_suffix("")).replace("\\", "/")
                        results.append((env_file, env_name, inf_path))
        else:
            for env_name in ["common", "staging", "prod"]:
                env_file = V2_DIR / "shared-secrets" / env_name / f"{secret_name}.env"
                if env_file.exists():
                    results.append((env_file, env_name, infisical_path))

    return results


def sync_single_file(client: InfisicalClient, file_path: Path, dry_run: bool = False) -> dict:
    """同步单个 .env 文件到 Infisical"""
    try:
        environment, infisical_path = map_file_to_infisical(file_path)
    except ValueError as e:
        print(f"  ✗ {e}")
        return {"created": 0, "updated": 0, "unchanged": 0, "failed": 1}

    print(f"\n[{file_path.name}]")
    print(f"  环境: {environment}, 路径: {infisical_path}")

    # 确保文件夹存在
    if not dry_run:
        client.ensure_folder_path(environment, infisical_path)

    # 同步（内部会对比现有值，只更新有变化的）
    stats = client.set_secrets_from_env(environment, file_path, infisical_path, dry_run)

    # 显示统计
    if stats["created"] == 0 and stats["updated"] == 0 and stats["unchanged"] > 0:
        print(f"  ✓ {stats['unchanged']} 个变量无变化")
    else:
        if stats["unchanged"] > 0:
            print(f"  - {stats['unchanged']} 个变量无变化")

    return stats


def sync_by_path(client: InfisicalClient, infisical_path: str, dry_run: bool = False,
                 recursive: bool = False) -> dict:
    """根据 Infisical 路径同步所有相关的本地文件"""
    files = find_env_files_for_path(infisical_path, recursive=recursive)

    if not files:
        print(f"  ✗ 未找到路径 {infisical_path} 对应的本地文件")
        return {"created": 0, "updated": 0, "unchanged": 0, "failed": 0}

    total_stats = {"created": 0, "updated": 0, "unchanged": 0, "failed": 0}

    for file_path, environment, path in files:
        print(f"\n[{file_path.relative_to(V2_DIR)}]")
        print(f"  环境: {environment}, 路径: {path}")

        if not dry_run:
            client.ensure_folder_path(environment, path)

        stats = client.set_secrets_from_env(environment, file_path, path, dry_run)

        for k in total_stats:
            total_stats[k] += stats[k]

        if stats["created"] == 0 and stats["updated"] == 0 and stats["unchanged"] > 0:
            print(f"  ✓ {stats['unchanged']} 个变量无变化")
        elif stats["unchanged"] > 0:
            print(f"  - {stats['unchanged']} 个变量无变化")

    return total_stats


def cleanup_deprecated_paths(client: InfisicalClient, dry_run: bool = False) -> None:
    """清理已废弃的路径"""
    print("\n" + "="*60)
    print("清理废弃路径")
    print("="*60)

    # 定义需要清理的废弃路径
    deprecated_paths = [
        # 旧的 BI 服务路径（已迁移到 /services/bi/{backend,dashboard,mcp}）
        "/services/bi-backend",
        "/services/bi-dashboard",
        "/services/bi-mcp",
        # 注意：/clickhouse 不是废弃路径，它是 clickhouse.env 同步的正确目标
    ]

    environments = ["common", "prod", "staging"]
    stats = {"deleted": 0, "not_found": 0, "failed": 0}

    for path in deprecated_paths:
        print(f"\n[{path}]")
        for env in environments:
            try:
                if dry_run:
                    # 检查是否存在
                    folder_name = path.strip("/").split("/")[-1]
                    parent_path = "/" + "/".join(path.strip("/").split("/")[:-1]) if "/" in path.strip("/") else "/"
                    folders = client.list_folders(env, parent_path)
                    exists = any(f["name"] == folder_name for f in folders)
                    if exists:
                        print(f"  [将删除] {env}:{path}")
                        stats["deleted"] += 1
                    else:
                        print(f"  ✓ {env}:{path} (不存在)")
                        stats["not_found"] += 1
                else:
                    deleted = client.delete_folder_by_path(env, path)
                    if deleted:
                        print(f"  ✗ 删除: {env}:{path}")
                        stats["deleted"] += 1
                    else:
                        print(f"  ✓ {env}:{path} (不存在)")
                        stats["not_found"] += 1
            except Exception as e:
                print(f"  ✗ 失败 {env}:{path}: {e}")
                stats["failed"] += 1

    # 打印总结
    print(f"\n  📊 清理汇总: 删除 {stats['deleted']}, 不存在 {stats['not_found']}, 失败 {stats['failed']}")


def purge_all_data(client: InfisicalClient, dry_run: bool = False) -> None:
    """清空所有环境中的所有数据（用于全量重新同步）"""
    print("\n" + "="*60)
    print("⚠️  清空所有数据")
    print("="*60)

    environments = ["common", "prod", "staging"]

    for env in environments:
        print(f"\n[{env} 环境]")

        # 1. 删除根路径的所有 secrets
        try:
            secrets = client.list_secrets(env, "/")
            if secrets:
                print(f"  删除根路径 {len(secrets)} 个变量...")
                if not dry_run:
                    for s in secrets:
                        try:
                            client.delete_secret(env, s["secretKey"], "/")
                        except Exception:
                            pass
        except Exception as e:
            print(f"  获取根路径变量失败: {e}")

        # 2. 删除根路径的所有 secret imports
        try:
            if not dry_run:
                client.delete_all_secret_imports(env, "/")
        except Exception:
            pass

        # 3. 删除所有文件夹（递归）
        try:
            folders = client.list_folders(env, "/")
            for folder in folders:
                folder_name = folder["name"]
                print(f"  删除文件夹: /{folder_name}")
                if not dry_run:
                    try:
                        client.delete_folder_recursive(env, f"/{folder_name}")
                    except Exception as e:
                        print(f"    失败: {e}")
        except Exception as e:
            print(f"  获取文件夹失败: {e}")

    print("\n✅ 清空完成")


# =============================================================================
# 主函数
# =============================================================================

def main():
    parser = argparse.ArgumentParser(
        description="同步环境变量到 Infisical",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
精确同步示例:
  # 同步指定文件
  python scripts/sync_to_infisical.py --file v2/services/bi/backend/staging.env

  # 同步指定 Infisical 路径（会同步 common/staging/prod 三个环境）
  python scripts/sync_to_infisical.py --path /services/bi/backend

  # 递归同步（同步路径下所有子目录的 .env 文件）
  python scripts/sync_to_infisical.py --path /services/bi -r
  python scripts/sync_to_infisical.py --path /shared-secrets --recursive

  # 预览模式
  python scripts/sync_to_infisical.py --path /services/bi/backend --dry-run

  # 同步多个路径
  python scripts/sync_to_infisical.py --path /services/bi/backend --path /shared-secrets/clickhouse
        """
    )
    parser.add_argument("--dry-run", action="store_true", help="预览操作，不实际执行")
    parser.add_argument("--step", type=int, choices=[1, 2, 3, 4], help="只执行指定步骤")
    parser.add_argument("--cleanup", action="store_true", help="清理已废弃的路径")
    parser.add_argument("--purge", action="store_true", help="清空所有数据后重新同步")
    parser.add_argument("--file", action="append", dest="files", metavar="FILE",
                        help="同步指定的 .env 文件（可多次使用）")
    parser.add_argument("--path", action="append", dest="paths", metavar="PATH",
                        help="同步指定的 Infisical 路径（可多次使用）")
    parser.add_argument("-r", "--recursive", action="store_true",
                        help="递归同步路径下的所有 .env 文件（与 --path 配合使用）")
    args = parser.parse_args()

    # 加载配置
    config = load_config()
    infisical_config = config.get("infisical", {})

    # 创建客户端
    client = InfisicalClient(
        server=infisical_config["server"],
        client_id=infisical_config["client_id"],
        client_secret=infisical_config["client_secret"],
        project_id=infisical_config["project_id"]
    )

    print("="*60)
    print("Infisical 环境变量同步")
    print("="*60)
    print(f"服务器: {infisical_config['server']}")
    print(f"项目 ID: {infisical_config['project_id']}")
    print(f"模式: {'DRY-RUN (预览)' if args.dry_run else '实际执行'}")

    # 测试连接
    try:
        project = client.get_project()
        print(f"项目名称: {project.get('name', 'N/A')}")
    except Exception as e:
        print(f"\n错误: 无法连接到 Infisical: {e}")
        sys.exit(1)

    # 精确同步模式（--file 或 --path）
    if args.files or args.paths:
        print("\n" + "="*60)
        print("精确同步模式")
        print("="*60)

        total_stats = {"created": 0, "updated": 0, "unchanged": 0, "failed": 0}

        # 处理 --file 参数
        if args.files:
            for file_arg in args.files:
                file_path = Path(file_arg)
                if not file_path.is_absolute():
                    file_path = BASE_DIR / file_arg
                if not file_path.exists():
                    print(f"\n  ✗ 文件不存在: {file_arg}")
                    total_stats["failed"] += 1
                    continue
                stats = sync_single_file(client, file_path, args.dry_run)
                for k in total_stats:
                    total_stats[k] += stats[k]

        # 处理 --path 参数
        if args.paths:
            for path_arg in args.paths:
                mode_str = "（递归）" if args.recursive else ""
                print(f"\n[路径: {path_arg}]{mode_str}")
                stats = sync_by_path(client, path_arg, args.dry_run, recursive=args.recursive)
                for k in total_stats:
                    total_stats[k] += stats[k]

        # 打印总结
        print("\n" + "="*60)
        print(f"同步汇总: 创建 {total_stats['created']}, 更新 {total_stats['updated']}, "
              f"无变化 {total_stats['unchanged']}, 失败 {total_stats['failed']}")
        print("="*60)
        if args.dry_run:
            print("\n这是预览模式，实际未执行任何操作。")
        return

    # 执行清理或同步
    if args.cleanup:
        # 只执行清理操作
        cleanup_deprecated_paths(client, args.dry_run)
    elif args.purge:
        # 先清空再全量同步
        purge_all_data(client, args.dry_run)
        if not args.dry_run:
            step1_setup_environments(client, args.dry_run)
            step2_import_shared_secrets(client, args.dry_run)
            services = step3_import_services(client, args.dry_run)
            step4_setup_service_imports(client, services, args.dry_run)
    elif args.step:
        if args.step == 1:
            step1_setup_environments(client, args.dry_run)
        elif args.step == 2:
            step2_import_shared_secrets(client, args.dry_run)
        elif args.step == 3:
            step3_import_services(client, args.dry_run)
        elif args.step == 4:
            step4_setup_service_imports(client, None, args.dry_run)
    else:
        step1_setup_environments(client, args.dry_run)
        step2_import_shared_secrets(client, args.dry_run)
        services = step3_import_services(client, args.dry_run)
        step4_setup_service_imports(client, services, args.dry_run)

    print("\n" + "="*60)
    print("完成！" if not args.dry_run else "DRY-RUN 完成！")
    print("="*60)


if __name__ == "__main__":
    main()
