# @optima-chat/ops-cli

> **System operations and monitoring CLI for Optima infrastructure**

DevOps and SRE tool for monitoring Optima infrastructure, services, databases, and logs with **read-only first** design.

**Key Features:**
- 🏥 Service health monitoring (HTTP endpoints + container status)
- 🚀 Deployment tracking (GitHub Actions integration)
- 🗄️ Database exploration (predefined queries, schema inspection)
- 🖥️ Infrastructure monitoring (EC2, RDS, ALB)
- 📝 Log analysis (CloudWatch Logs search)
- 🔒 Safety-first design (SSH command whitelisting, read-only transactions)

## Installation

### From NPM (Future)

```bash
npm install -g @optima-chat/ops-cli
```

### From Source

```bash
git clone https://github.com/Optima-Chat/optima-ops-cli.git
cd optima-ops-cli
npm install
npm run build
npm link
```

## Prerequisites

1. **SSH Key**: EC2 access key from AWS Parameter Store
   ```bash
   aws ssm get-parameter \
     --name /optima/ec2/ssh-private-key \
     --with-decryption \
     --query Parameter.Value \
     --output text > ~/.ssh/optima-ec2-key

   chmod 600 ~/.ssh/optima-ec2-key
   ```

2. **AWS CLI**: Configured with appropriate permissions
   ```bash
   aws configure
   # Or use AWS_PROFILE environment variable
   ```

3. **GitHub CLI** (optional, for deployment commands):
   ```bash
   # macOS
   brew install gh

   # Authenticate
   gh auth login
   ```

## Quick Start

### Check Current Environment

```bash
optima-ops env
```

Output:
```
当前环境配置:

  环境: production
  EC2 主机: ec2-prod.optima.shop
  RDS 主机: optima-prod-postgres.ctg866o0ehac.ap-southeast-1.rds.amazonaws.com
  服务列表: user-auth, mcp-host, commerce-backend, agentic-chat
```

### Service Health Check

```bash
# Check all services in production
optima-ops services health

# Check specific service
optima-ops services health --service user-auth

# Check in stage environment
optima-ops services health --env stage

# JSON output
optima-ops services health --json
```

Output:
```
🏥 服务健康检查 - production 环境

检查 user-auth... ✓ 健康 (120ms)
检查 mcp-host... ✓ 健康 (150ms)
检查 commerce-backend... ✓ 健康 (180ms)
检查 agentic-chat... ✓ 健康 (160ms)

检查容器状态...

总结:
  ✓ 所有服务健康 (4/4)
```

### Deployment Status

```bash
# View recent deployments for a service
optima-ops deploy status user-auth

# View deployments in stage environment
optima-ops deploy status user-auth --env stage

# Limit number of results
optima-ops deploy status user-auth --limit 5
```

## Available Commands

### Services Module

```bash
optima-ops services health [--env prod|stage|dev] [--service <name>] [--json]
  # Check service health status (HTTP /health + container status)
```

**Coming Soon:**
- `services status` - View container status
- `services logs <service>` - View container logs
- `services inspect <service>` - View container configuration
- `services restart <service>` - Restart service container (with confirmation)

### Deploy Module

```bash
optima-ops deploy status <service> [--env prod|stage|dev] [--limit 10] [--json]
  # View GitHub Actions deployment history
```

**Coming Soon:**
- `deploy watch <service>` - Watch deployment in real-time
- `deploy list` - List all services' deployment status
- `deploy logs <service> <run-id>` - View deployment logs
- `deploy trigger <service>` - Trigger deployment (with confirmation)

### Database Module (Planned)

```bash
# Coming in Phase 2
optima-ops db stats merchant_signups    # Predefined query: merchant signups trend
optima-ops db stats order_revenue       # Predefined query: order revenue analysis
optima-ops db schema optima_commerce    # View database schema
optima-ops db tables optima_commerce    # List tables
```

### Infrastructure Module (Planned)

```bash
# Coming in Phase 3
optima-ops infra ec2                    # EC2 instance metrics
optima-ops infra rds                    # RDS performance metrics
optima-ops infra alb                    # ALB health check status
```

### Logs Module (Planned)

```bash
# Coming in Phase 4
optima-ops logs search <pattern>        # Search CloudWatch Logs
optima-ops logs errors --last 1h        # Recent error logs
optima-ops logs tail <service>          # Tail service logs
```

### Config Module (Planned)

```bash
# Coming in Phase 5
optima-ops config show <service>        # View service environment variables
optima-ops config compare prod stage    # Compare configurations
```

## Environment Management

### Environment Variables

```bash
# Set environment
export OPTIMA_OPS_ENV=production  # or stage, development

# Custom SSH key path
export OPTIMA_SSH_KEY=~/.ssh/custom-key

# AWS configuration
export AWS_REGION=ap-southeast-1
export AWS_PROFILE=optima

# Output format
export OPTIMA_OUTPUT=json

# Non-interactive mode (for CI/CD)
export NON_INTERACTIVE=1
export CI=true
```

### Supported Environments

| Environment | EC2 Host | Services |
|-------------|----------|----------|
| **production** | ec2-prod.optima.shop | user-auth, mcp-host, commerce-backend, agentic-chat |
| **stage** | ec2-stage.optima.shop | user-auth, mcp-host, commerce-backend, agentic-chat |
| **development** | ec2-dev.optima.shop | user-auth, mcp-host, commerce-backend, agentic-chat |

## Output Formats

### Human-Readable (Default)

Colored tables and formatted text for terminal use.

### JSON Format

```bash
# Use --json flag
optima-ops services health --json

# Or environment variable
export OPTIMA_OUTPUT=json
optima-ops services health
```

Example JSON output:
```json
{
  "success": true,
  "data": {
    "environment": "production",
    "services": [
      {
        "service": "user-auth",
        "url": "https://auth.optima.shop",
        "status": "healthy",
        "http_status": 200,
        "response_time": "120ms",
        "container_status": "Up 3 days"
      }
    ],
    "summary": {
      "total": 4,
      "healthy": 4,
      "unhealthy": 0,
      "error": 0
    }
  }
}
```

## Safety Features

### Read-Only First Design

- **93% read-only commands**: Pure observation, no side effects
- **7% low-risk commands**: Restart, deploy trigger (require `--yes` confirmation)
- **0% dangerous commands**: Delete, cleanup, arbitrary SQL (blocked)

### SSH Command Whitelisting

All SSH commands are validated against a whitelist:

**Allowed (Read-Only)**:
- `docker ps`, `docker logs`, `docker inspect`, `docker stats`
- `cat`, `grep`, `tail`, `head`, `ls`, `find`
- `df -h`, `free -h`, `uptime`, `systemctl status`

**Low-Risk (Require Confirmation)**:
- `docker-compose restart`
- `docker restart`
- `systemctl restart`

**Blocked (Dangerous)**:
- `rm`, `docker rm`, `docker system prune`
- `kill`, `shutdown`, `reboot`
- Shell operators: `>`, `>>`, `|`, `;`, `&&`, `||`

### Database Safety

- **Forced READ ONLY transactions**: All database queries run in `BEGIN TRANSACTION READ ONLY` mode
- **Predefined queries**: Use parameterized templates to avoid SQL injection
- **No manual SQL**: Manual queries not allowed to prevent field/table name errors

### Sensitive Data Masking

Automatic obfuscation of:
- Passwords (`password=***`)
- Tokens (`token=***`)
- Connection strings (`user:***@host`)
- AWS keys (`AKIA***`)

## Interactive Mode

### Auto-Prompts

When parameters are missing, the CLI will prompt you interactively (unless in CI/CD):

```bash
$ optima-ops services logs

? 选择服务: (Use arrow keys)
❯ user-auth
  mcp-host
  commerce-backend
  agentic-chat
```

### Confirmation for Dangerous Actions

```bash
$ optima-ops services restart user-auth

⚠️  即将执行危险操作:
   操作: restart
   目标: user-auth
   环境: production

? 确定要继续吗？ (y/N)
```

### Non-Interactive Mode

Disable prompts for CI/CD:

```bash
export NON_INTERACTIVE=1
# or
export CI=true

optima-ops services health --json
```

## Development

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Development mode (watch)
npm run dev -- services health

# Lint
npm run lint

# Format
npm run format
```

## Roadmap

- [x] **Phase 1** (Current): Services + Deploy modules
  - [x] Core utilities (config, output, error, prompt)
  - [x] SSH client with whitelisting
  - [x] AWS SDK clients
  - [x] GitHub CLI wrapper
  - [x] `services health`
  - [x] `deploy status`
  - [ ] Additional services commands
  - [ ] Additional deploy commands

- [ ] **Phase 2**: Database module (exploration, queries, schema)
- [ ] **Phase 3**: Infrastructure module (EC2, RDS, ALB metrics)
- [ ] **Phase 4**: Logs module (CloudWatch search, tail, errors)
- [ ] **Phase 5**: Config module (env vars, Parameter Store)

## Troubleshooting

**SSH connection failed**:
```bash
# Check key exists
ls -la ~/.ssh/optima-ec2-key

# Fix permissions
chmod 600 ~/.ssh/optima-ec2-key

# Test connection
ssh -i ~/.ssh/optima-ec2-key ec2-user@ec2-prod.optima.shop
```

**AWS permissions error**:
```bash
# Verify identity
aws sts get-caller-identity

# Set correct profile
export AWS_PROFILE=optima
```

**GitHub CLI not found**:
```bash
# Install (macOS)
brew install gh

# Install (Linux)
# See https://github.com/cli/cli/blob/trunk/docs/install_linux.md

# Authenticate
gh auth login
```

## Links

- [CLAUDE.md](./CLAUDE.md) - Developer documentation
- [Design Document](../../notes-private/projects/Optima%20Ops%20CLI%20设计方案.md)
- [GitHub](https://github.com/Optima-Chat/optima-ops-cli)
- [NPM](https://www.npmjs.com/package/@optima-chat/ops-cli)

## License

MIT
