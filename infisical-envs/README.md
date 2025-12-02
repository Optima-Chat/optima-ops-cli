# Infisical 环境变量管理 - 三层架构 v2

## 核心设计

```
┌─────────────────────────────────────────────────────────────────┐
│                     optima-shared-secrets                        │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐        │
│  │    common     │  │     prod      │  │    staging    │        │
│  │ AUTH_DB_USER  │  │ AUTH_DB_NAME  │  │ AUTH_DB_NAME  │        │
│  │ DATABASE_HOST │  │ = optima_auth │  │ = optima_     │        │
│  │ ANTHROPIC_KEY │  │               │  │   stage_auth  │        │
│  └───────────────┘  └───────────────┘  └───────────────┘        │
└─────────────────────────────────────────────────────────────────┘
                              ↓ import
┌─────────────────────────────────────────────────────────────────┐
│                      optima-user-auth                            │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ common (import shared/common/*)                           │  │
│  │   DB_USER=${AUTH_DB_USER}      ← 映射到标准 key           │  │
│  │   DB_PASSWORD=${AUTH_DB_PASSWORD}                         │  │
│  │   DATABASE_HOST=${DATABASE_HOST}                          │  │
│  └───────────────────────────────────────────────────────────┘  │
│  ┌───────────────┐              ┌───────────────┐               │
│  │ prod          │              │ staging       │               │
│  │ (import       │              │ (import       │               │
│  │  common +     │              │  common +     │               │
│  │  shared/prod) │              │  shared/stg)  │               │
│  │               │              │               │               │
│  │ DB_NAME=      │              │ DB_NAME=      │               │
│  │ ${AUTH_DB_    │              │ ${AUTH_DB_    │               │
│  │   NAME}       │              │   NAME}       │               │
│  └───────────────┘              └───────────────┘               │
└─────────────────────────────────────────────────────────────────┘
```

## 关键设计：Secret Reference 映射

每个服务在 `common.env` 中使用 `${VAR}` 语法引用 shared-secrets 的值，并**映射到服务需要的标准 key**：

```bash
# shared-secrets/common/database-users.env
AUTH_DB_USER=auth_user
AUTH_DB_PASSWORD=xxx
COMMERCE_DB_USER=commerce_user
COMMERCE_DB_PASSWORD=yyy

# user-auth/common.env - 映射到标准 key
DB_USER=${AUTH_DB_USER}
DB_PASSWORD=${AUTH_DB_PASSWORD}

# commerce-backend/common.env - 映射到同样的标准 key，但引用不同的值
DB_USER=${COMMERCE_DB_USER}
DB_PASSWORD=${COMMERCE_DB_PASSWORD}
```

---

## 目录结构

```
infisical-envs/
├── README.md
├── archive/                     # 旧版配置归档
└── v2/
    ├── shared-secrets/          # optima-shared-secrets 项目
    │   ├── common/
    │   │   ├── infrastructure.env     # DATABASE_HOST, REDIS_HOST
    │   │   ├── database-users.env     # AUTH_DB_USER, COMMERCE_DB_USER, ...
    │   │   └── third-party-apis/
    │   │       ├── anthropic.env
    │   │       ├── openai.env
    │   │       └── ...
    │   ├── prod/
    │   │   ├── database-names.env     # AUTH_DB_NAME=optima_auth
    │   │   ├── redis-databases.env    # REDIS_DB_AUTH=0
    │   │   ├── domain-urls.env        # AUTH_URL=https://auth.optima.shop
    │   │   ├── s3-buckets.env
    │   │   └── stripe.env
    │   └── staging/
    │       ├── database-names.env     # AUTH_DB_NAME=optima_stage_auth
    │       ├── redis-databases.env    # REDIS_DB_AUTH=2
    │       ├── domain-urls.env        # AUTH_URL=https://auth.stage.optima.onl
    │       ├── s3-buckets.env
    │       └── stripe.env
    │
    └── services/
        ├── user-auth/
        │   ├── common.env     # DB_USER=${AUTH_DB_USER}, ...
        │   ├── prod.env       # DB_NAME=${AUTH_DB_NAME}, JWT_SECRET=xxx
        │   └── staging.env    # DB_NAME=${AUTH_DB_NAME}, JWT_SECRET=yyy
        ├── commerce-backend/
        ├── agentic-chat/
        ├── mcp-host/
        └── {mcp-tools}/       # TODO
```

---

## Infisical 配置步骤

### Step 1: 创建 Common 环境

在每个项目中添加 `common` 环境：

```
Project Settings → Environments → Add Environment
Name: common
Slug: common
```

### Step 2: 导入 Secrets 到 optima-shared-secrets

| 文件 | 导入到 |
|------|--------|
| `shared-secrets/common/infrastructure.env` | common / (根目录或 infrastructure folder) |
| `shared-secrets/common/database-users.env` | common / (根目录或 database-users folder) |
| `shared-secrets/common/third-party-apis/*.env` | common / third-party-apis / {name} |
| `shared-secrets/prod/*.env` | prod / {name} |
| `shared-secrets/staging/*.env` | staging / {name} |

### Step 3: 配置 Service 的 Secret Imports

**user-auth/common 的 Imports:**
```
1. optima-shared-secrets / common / infrastructure
2. optima-shared-secrets / common / database-users
3. optima-shared-secrets / common / third-party-apis / resend
```

**user-auth/prod 的 Imports:**
```
1. optima-user-auth / common              ← 服务自己的 common
2. optima-shared-secrets / prod / database-names
3. optima-shared-secrets / prod / redis-databases
4. optima-shared-secrets / prod / domain-urls
```

**user-auth/staging 的 Imports:**
```
1. optima-user-auth / common              ← 同样的服务 common
2. optima-shared-secrets / staging / database-names   ← 不同环境！
3. optima-shared-secrets / staging / redis-databases
4. optima-shared-secrets / staging / domain-urls
```

### Step 4: 导入服务配置

| 文件 | 导入到 |
|------|--------|
| `services/user-auth/common.env` | optima-user-auth / common |
| `services/user-auth/prod.env` | optima-user-auth / prod |
| `services/user-auth/staging.env` | optima-user-auth / staging |

---

## Import 速查表

### User Auth

| 环境 | Secret Imports |
|------|---------------|
| common | shared/common/{infrastructure, database-users, resend} |
| prod | self/common + shared/prod/{database-names, redis, domain-urls} |
| staging | self/common + shared/staging/{database-names, redis, domain-urls} |

### Commerce Backend

| 环境 | Secret Imports |
|------|---------------|
| common | shared/common/{infrastructure, database-users, anthropic, resend, easyship, exchangerate} |
| prod | self/common + shared/prod/{database-names, redis, domain-urls, s3-buckets, stripe} |
| staging | self/common + shared/staging/{...} |

### Agentic Chat

| 环境 | Secret Imports |
|------|---------------|
| common | shared/common/{infrastructure, database-users, anthropic, openai} |
| prod | self/common + shared/prod/{database-names, redis, domain-urls} |
| staging | self/common + shared/staging/{...} |

### MCP Host

| 环境 | Secret Imports |
|------|---------------|
| common | shared/common/{infrastructure, database-users, anthropic, openai, resend} |
| prod | self/common + shared/prod/{database-names, redis, domain-urls} |
| staging | self/common + shared/staging/{...} |

---

## 维护指南

### 改 API Key（如 ANTHROPIC_API_KEY）

```
只改: optima-shared-secrets / common / third-party-apis / anthropic
效果: 所有服务、所有环境自动更新
```

### 改数据库用户密码

```
只改: optima-shared-secrets / common / database-users
效果: 所有服务、所有环境自动更新
```

### 改某个环境的数据库名

```
只改: optima-shared-secrets / prod / database-names
效果: 只影响 prod 环境
```

### 改某个服务的 JWT Secret

```
只改: optima-user-auth / prod (或 staging)
效果: 只影响该服务该环境
```

---

## MCP 工具服务

MCP 工具服务（comfy-mcp, fetch-mcp 等）配置待完成，目录下有 README.md 说明需要的 imports。

---

**最后更新**: 2025-11-25
