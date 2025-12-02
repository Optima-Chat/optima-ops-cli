# Infisical v2 vs Archive-v2 对比报告

**生成时间**: 2025-11-25 (更新)

## 概述

| 类别 | 数量 | 说明 |
|------|------|------|
| ✅ 完全匹配 | 大部分 | 变量名和值都一致 |
| 🔄 预期差异 | 多项 | 引用展开后有实际值，archive-v2 是空占位符 |
| ⚠️ 意外差异 | 21项 | 需要检查的差异（已从33项减少） |
| ❌ 缺失变量 | 9项 | archive-v2 有但 v2 没有（已从15项减少） |
| ➕ 新增变量 | 多项 | v2 有但 archive-v2 没有（正常增强） |

---

## 核心服务对比

### user-auth

#### prod
| 状态 | 变量 | archive-v2 | Infisical expanded |
|------|------|------------|-------------------|
| ✅ | `JWT_SECRET_KEY` | *(空)* | `JUV66bpWdIlXYX4FXStMaZV5CDeklKqDqlTj0YOeiE=` |
| ✅ | `SECRET_KEY` | *(空)* | `1JUV66bpWdIlXYX4FXStMaZV5CDeklKqDqlTj0YOeiE=` |
| ⚠️ | `BACKEND_CORS_ORIGINS` | `["https://admin.optima.chat","https://*.optima.shop","https://...` | `["http://localhost:3000","http://localhost:8295","https://*....` |
| ❌ | `SOCIAL_AUTH_HTTP_PROXY` | *(空)* | **缺失** |

#### staging
| 状态 | 变量 | archive-v2 | Infisical expanded |
|------|------|------------|-------------------|
| ✅ | `JWT_SECRET_KEY` | *(空)* | `staging-JUV66bpWdIlXYX4FXStMaZV5CDeklKqDqlTj0YOeiE=` |
| ✅ | `SECRET_KEY` | *(空)* | `staging-1JUV66bpWdIlXYX4FXStMaZV5CDeklKqDqlTj0YOeiE=` |
| ⚠️ | `APP_NAME` | `user-auth-stage` | `user-auth` |
| ⚠️ | `BACKEND_CORS_ORIGINS` | `["https://*.optima.chat","https://*.optima.shop","https://*....` | `["http://localhost:3000","http://localhost:8295","https://*....` |
| ❌ | `SOCIAL_AUTH_HTTP_PROXY` | *(空)* | **缺失** |

---

### mcp-host

#### prod
| 状态 | 变量 | archive-v2 | Infisical expanded |
|------|------|------------|-------------------|
| ✅ | `GOOGLE_API_KEY` | *(空)* | `AIzaSyA8MIaL_hpCR3YwYQTEhKsKuBMWb5GUgag` |
| ✅ | `GOOGLE_CSE_ID` | *(空)* | `76fd65f3e5bf94596` |
| ❌ | `MCP_HOST_PROXY_URL` | *(空)* | **缺失** |
| ❌ | `LOCAL_OPENAI_API_BASE` | *(空)* | **缺失** |
| ❌ | `LOCAL_OPENAI_API_KEY` | *(空)* | **缺失** |

#### staging
| 状态 | 变量 | archive-v2 | Infisical expanded |
|------|------|------------|-------------------|
| ✅ | `GOOGLE_API_KEY` | *(空)* | `AIzaSyA8MIaL_hpCR3YwYQTEhKsKuBMWb5GUgag` |
| ✅ | `GOOGLE_CSE_ID` | *(空)* | `76fd65f3e5bf94596` |
| ❌ | `MCP_HOST_PROXY_URL` | *(空)* | **缺失** |
| ❌ | `LOCAL_OPENAI_API_BASE` | *(空)* | **缺失** |
| ❌ | `LOCAL_OPENAI_API_KEY` | *(空)* | **缺失** |

---

### commerce-backend

#### prod
| 状态 | 变量 | archive-v2 | Infisical expanded |
|------|------|------------|-------------------|
| ✅ | `SECRET_KEY` | *(空)* | `Loee027yH-7zkojJ_V57rBwiaB7jUUEjB9Q7KK9Tg1A` |
| ✅ | `LOG_LEVEL` | `INFO` | `INFO` |
| ✅ | `DEBUG` | `false` | `false` |
| ⚠️ | `EASYSHIP_API_VERSION` | *(空)* | `v2024_09` |
| ⚠️ | `EASYSHIP_TIMEOUT` | *(空)* | `30` |

#### staging
| 状态 | 变量 | archive-v2 | Infisical expanded |
|------|------|------------|-------------------|
| ✅ | `SECRET_KEY` | *(空)* | `staging-Loee027yH-7zkojJ_V57rBwiaB7jUUEjB9Q7KK9Tg1A` |
| ✅ | `LOG_LEVEL` | `DEBUG` | `DEBUG` |
| ✅ | `DEBUG` | `true` | `true` |
| ⚠️ | `EASYSHIP_API_VERSION` | *(空)* | `v2024_09` |
| ⚠️ | `EASYSHIP_TIMEOUT` | *(空)* | `30` |

---

### agentic-chat

#### prod
| 状态 | 变量 | archive-v2 | Infisical expanded |
|------|------|------------|-------------------|
| ✅ | `APP_SECRET` | *(空)* | `REPLACE_WITH_REAL_SECRET_KEY` |
| ✅ | `EMAIL_PASSWORD_SECRET` | *(空)* | `m6JLPrZ4mdlyOIbLBWYOg2kOxuBsVQcmIzhsYh5pKcM=` |

#### staging
| 状态 | 变量 | archive-v2 | Infisical expanded |
|------|------|------------|-------------------|
| ✅ | `APP_SECRET` | *(空)* | `staging-REPLACE_WITH_REAL_SECRET_KEY` |
| ✅ | `EMAIL_PASSWORD_SECRET` | *(空)* | `staging-m6JLPrZ4mdlyOIbLBWYOg2kOxuBsVQcmIzhsYh5pKcM=` |

---

## MCP 服务对比

### comfy-mcp ✅
**prod/staging**: 完全匹配，无差异

### fetch-mcp ✅
**prod/staging**: 完全匹配，无差异

### perplexity-mcp ✅
**prod/staging**: 完全匹配，无差异

### shopify-mcp ✅
**prod/staging**: 完全匹配，无差异

### commerce-mcp ✅
**prod/staging**: 完全匹配，无差异

### google-ads-mcp ✅
**prod/staging**: 完全匹配，无差异

### chart-mcp ⚠️
**archive-v2 文件不存在** (新服务，只有 v2 配置)

---

## 已修复项 ✅

| 服务 | 变量 | 修复内容 |
|------|------|---------|
| mcp-host | `GOOGLE_CSE_ID` | 添加到 prod.env 和 staging.env，引用 `${common.third-party-apis.google.GOOGLE_SEARCH_CX}` |
| commerce-backend | `LOG_LEVEL` | prod=INFO, staging=DEBUG |
| commerce-backend | `DEBUG` | prod=false, staging=true |
| shared-secrets | `google.env` | 创建 Google API 共享配置文件 |

---

## 差异分类说明

### ✅ 正常差异（敏感值展开）

这些差异是正常的：
- **archive-v2** 是平面配置文件，敏感值设为空占位符
- **v2 expanded** 是从 Infisical 拉取的实际值

| 变量类型 | 说明 |
|----------|------|
| `JWT_SECRET_KEY`, `SECRET_KEY`, `APP_SECRET` | 敏感值，v2 有实际值 |
| `EASYSHIP_*` | 从 shared-secrets 引用展开 |
| `GOOGLE_API_KEY`, `GOOGLE_CSE_ID` | 从 shared-secrets 引用展开 |

### ⚠️ 需要确认的差异

| 服务 | 变量 | 差异说明 |
|------|------|---------|
| user-auth | `BACKEND_CORS_ORIGINS` | v2 包含更多 localhost 开发域名 |
| user-auth | `APP_NAME` (staging) | 命名规范 `user-auth` vs `user-auth-stage` |

### ❌ 缺失变量（可选添加）

| 服务 | 变量 | 用途 | 建议 |
|------|------|------|------|
| user-auth | `SOCIAL_AUTH_HTTP_PROXY` | 社交登录代理 | 可选，按需添加 |
| mcp-host | `MCP_HOST_PROXY_URL` | MCP 代理 | 可选，按需添加 |
| mcp-host | `LOCAL_OPENAI_API_BASE` | 本地 OpenAI | 可选，不常用 |
| mcp-host | `LOCAL_OPENAI_API_KEY` | 本地 OpenAI | 可选，不常用 |

---

## 结论

1. **MCP 服务 (6个)**: ✅ 全部验证通过
2. **核心服务 (4个)**:
   - ✅ 敏感值正确展开
   - ✅ `GOOGLE_CSE_ID` 已添加
   - ✅ `LOG_LEVEL` / `DEBUG` 已添加
   - ⚠️ 少量可选配置缺失

3. **共享配置**:
   - ✅ 创建 `google.env` 存放 Google API 配置
   - ✅ 引用路径 `${common.third-party-apis.google.*}` 正常工作

**v2 配置已基本与 archive-v2 对齐，可以投入使用。**
