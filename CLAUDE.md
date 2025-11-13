# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

## Project Overview

Optima Ops CLI - DevOps and monitoring CLI tool for Optima infrastructure. Provides read-only observability and low-risk operational commands for managing EC2 instances, Docker containers, AWS resources, and GitHub Actions deployments.

**Stack**: TypeScript ES Modules, Commander.js, SSH2, AWS SDK v3, Axios, Inquirer.js

**Design Principle**: **Read-only first** - 93% commands are pure observation, 7% low-risk commands require confirmation

## Quick Start

```bash
# Install dependencies
npm install

# Build
npm run build

# Development
npm run dev -- --help
npm run dev -- env
npm run dev -- services health
npm run dev -- deploy status user-auth

# Production
npm start
```

## Architecture

### Directory Structure

```
src/
├── index.ts                     # CLI entry point
├── commands/                    # Command modules
│   ├── services/               # Service management (health, status, logs, inspect, restart)
│   └── deploy/                 # Deployment management (status, watch, list, logs, trigger)
├── utils/                       # Core utilities
│   ├── config.ts               # Environment configuration
│   ├── output.ts               # Output formatting (JSON/human)
│   ├── error.ts                # Error handling
│   ├── prompt.ts               # Interactive prompts
│   ├── ssh.ts                  # SSH client with command whitelisting
│   ├── github.ts               # GitHub CLI wrapper
│   └── aws/                    # AWS SDK clients
│       ├── ssm.ts              # Parameter Store
│       ├── ec2.ts              # EC2 instances
│       ├── rds.ts              # RDS databases
│       └── logs.ts             # CloudWatch Logs
```

### Key Design Patterns

1. **Multi-Environment Support** (Production/Stage/Development)
   - Config file: `~/.config/optima-ops-cli/config.json`
   - Environment variable: `OPTIMA_OPS_ENV`
   - Per-environment EC2/RDS endpoints

2. **SSH Command Whitelisting** (`utils/ssh.ts`)
   - Read-only commands: `docker ps`, `docker logs`, `cat`, `grep`, etc.
   - Low-risk commands: `docker-compose restart`, `systemctl restart`
   - Dangerous commands blocked: `rm`, `docker rm`, `shutdown`, etc.

3. **Dual Output Format**
   - Human-readable: Colored tables, formatted text
   - JSON format: `--json` flag or `OPTIMA_OUTPUT=json`

4. **Interactive Prompts** (Inquirer.js)
   - Auto-prompt for missing parameters (service, database, table)
   - Disabled in CI/CD environments (`NON_INTERACTIVE=1`, `CI=true`)

5. **AWS Integration**
   - Parameter Store for secrets
   - EC2/RDS instance metadata
   - CloudWatch Logs search

6. **GitHub Actions Integration**
   - View deployment history
   - Trigger workflows
   - Watch deployment progress
   - View logs

## Environment Configuration

### Environment Variables

```bash
# Environment selection
export OPTIMA_OPS_ENV=production  # or stage, development

# SSH key path (optional)
export OPTIMA_SSH_KEY=~/.ssh/optima-ec2-key

# AWS configuration
export AWS_REGION=ap-southeast-1
export AWS_PROFILE=optima

# Output format
export OPTIMA_OUTPUT=json

# Non-interactive mode
export NON_INTERACTIVE=1
```

### Config File Structure

```json
{
  "environment": "production",
  "ec2": {
    "production": {
      "host": "ec2-prod.optima.shop",
      "user": "ec2-user",
      "keyPath": "~/.ssh/optima-ec2-key"
    },
    "stage": { "host": "ec2-stage.optima.shop", ... },
    "development": { "host": "ec2-dev.optima.shop", ... }
  },
  "aws": {
    "region": "ap-southeast-1",
    "profile": "default"
  }
}
```

## Available Commands (Phase 1)

### Services Module

```bash
# Check service health (HTTP /health endpoint + container status)
optima-ops services health [--env prod|stage] [--service <name>]

# TODO: Additional commands
# optima-ops services status
# optima-ops services logs <service> [--tail 100] [--follow]
# optima-ops services inspect <service>
# optima-ops services restart <service> [--yes]
```

### Deploy Module

```bash
# View deployment history from GitHub Actions
optima-ops deploy status <service> [--env prod|stage] [--limit 10]

# TODO: Additional commands
# optima-ops deploy watch <service> [--env prod|stage]
# optima-ops deploy list [--env prod|stage]
# optima-ops deploy logs <service> <run-id>
# optima-ops deploy trigger <service> [--mode deploy-only] [--yes]
```

### Utility Commands

```bash
# Show current environment configuration
optima-ops env

# Show version information
optima-ops version
```

## Development

### Adding New Commands

1. Create command file: `src/commands/<module>/<action>.ts`
2. Follow the pattern:
```typescript
import { Command } from 'commander';
import { handleError } from '../../utils/error.js';
import { isJsonOutput, outputSuccess } from '../../utils/output.js';

export const myCommand = new Command('my-command')
  .description('Command description')
  .option('--env <env>', 'Environment')
  .option('--json', 'JSON output')
  .action(async (options) => {
    try {
      // Implementation
      if (isJsonOutput()) {
        outputSuccess(data);
      } else {
        // Human-readable output
      }
    } catch (error) {
      handleError(error);
    }
  });
```
3. Export from module: `src/commands/<module>/index.ts`
4. Register in `src/index.ts`

### TypeScript ES Modules

**Critical**: Must use `.js` extensions in imports even though files are `.ts`:

```typescript
// ✅ Correct
import { SSHClient } from '../../utils/ssh.js';

// ❌ Wrong
import { SSHClient } from '../../utils/ssh';
```

### Testing Locally

```bash
# Test with dev runner
npm run dev -- services health

# Test with built version
npm run build
npm start services health
```

## SSH Safety

### Command Validation

All SSH commands go through `validateCommand()` in `utils/ssh.ts`:

```typescript
const validation = validateCommand(command);
if (!validation.safe) {
  throw new CommandExecutionError(`命令被安全策略阻止: ${validation.reason}`);
}
```

### Read-Only Commands (Allowed)

- `docker ps`, `docker logs`, `docker inspect`, `docker stats`
- `cat`, `grep`, `tail`, `head`, `ls`, `find`
- `df -h`, `free -h`, `uptime`, `systemctl status`

### Low-Risk Commands (Require Confirmation)

- `docker-compose restart`
- `docker restart`
- `systemctl restart`

### Dangerous Commands (Blocked)

- `rm`, `docker rm`, `docker system prune`
- `kill`, `shutdown`, `reboot`
- Shell operators: `>`, `>>`, `|`, `;`, `&&`, `||`

## AWS Integration

### Required IAM Permissions

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ssm:GetParameter",
        "ssm:GetParametersByPath",
        "ec2:DescribeInstances",
        "ec2:DescribeInstanceStatus",
        "rds:DescribeDBInstances",
        "logs:DescribeLogGroups",
        "logs:DescribeLogStreams",
        "logs:GetLogEvents",
        "logs:FilterLogEvents"
      ],
      "Resource": "*"
    }
  ]
}
```

### SSH Key Setup

```bash
# Get SSH key from Parameter Store (first time)
aws ssm get-parameter \
  --name /optima/ec2/ssh-private-key \
  --with-decryption \
  --query Parameter.Value \
  --output text > ~/.ssh/optima-ec2-key

chmod 600 ~/.ssh/optima-ec2-key
```

## GitHub CLI Integration

### Required Setup

```bash
# Install GitHub CLI
# macOS: brew install gh
# Linux: https://github.com/cli/cli/blob/trunk/docs/install_linux.md

# Authenticate
gh auth login

# Test
gh run list --repo Optima-Chat/user-auth --limit 5
```

### Supported Operations

- List workflow runs: `getWorkflowRuns(repo, options)`
- View run details: `getRunDetails(repo, runId)`
- Get run jobs: `getRunJobs(repo, runId)`
- Watch run: `watchRun(repo, runId)`
- Trigger workflow: `triggerWorkflow(repo, workflow, inputs)`

## Error Handling

### Custom Error Classes

- `OpsCLIError` - Base error
- `SSHConnectionError` - SSH connection failures
- `AWSError` - AWS SDK errors
- `ConfigurationError` - Config file issues
- `CommandExecutionError` - Command execution failures
- `ValidationError` - Input validation errors

### Error Output Formats

**Human-readable**:
```
✗ 错误: SSH 连接失败

提示: 请检查 SSH 密钥和网络连接
  1. 确认 SSH 密钥存在: ~/.ssh/optima-ec2-key
  2. 确认密钥权限正确: chmod 600 ~/.ssh/optima-ec2-key
  3. 确认能访问 EC2 实例
```

**JSON**:
```json
{
  "success": false,
  "error": {
    "code": "SSH_CONNECTION_ERROR",
    "message": "无法连接到 ec2-prod.optima.shop: Connection timeout",
    "details": { "host": "ec2-prod.optima.shop", "error": "Connection timeout" }
  }
}
```

## Roadmap

### Phase 1 (Current) - Core Services & Deploy
- ✅ Project structure and core utilities
- ✅ SSH client with command whitelisting
- ✅ AWS SDK clients (SSM, EC2, RDS, CloudWatch Logs)
- ✅ GitHub CLI wrapper
- ✅ `services health` command
- ✅ `deploy status` command
- ⏳ Additional services commands (status, logs, inspect, restart)
- ⏳ Additional deploy commands (watch, list, logs, trigger)

### Phase 2 - Database Module
- Database connection management
- Predefined statistical queries (45+ queries)
- Query executor with parameterized templates
- Schema exploration
- Table metadata

### Phase 3 - Infrastructure Module
- EC2 metrics and monitoring
- RDS performance insights
- ALB health checks
- ECS service status

### Phase 4 - Logs Module
- CloudWatch Logs search
- Error aggregation
- Log tailing
- Pattern matching

### Phase 5 - Config Module
- View environment variables
- Parameter Store exploration
- Sensitive data masking
- Configuration comparison

## Common Issues

**SSH Connection Failed**:
- Check SSH key exists: `ls -la ~/.ssh/optima-ec2-key`
- Check key permissions: `chmod 600 ~/.ssh/optima-ec2-key`
- Test connection: `ssh -i ~/.ssh/optima-ec2-key ec2-user@ec2-prod.optima.shop`

**AWS Permissions Error**:
- Verify IAM permissions
- Check AWS CLI: `aws sts get-caller-identity`
- Set correct profile: `export AWS_PROFILE=optima`

**GitHub CLI Not Found**:
- Install: `brew install gh` (macOS) or see https://cli.github.com/
- Authenticate: `gh auth login`

**Command Blocked by Whitelist**:
- Review allowed commands in `utils/ssh.ts`
- Dangerous commands are intentionally blocked for safety

## Related Projects

- **optima-cli**: Main CLI for e-commerce operations (products, orders, etc.)
- **optima-terraform**: Infrastructure as Code (EC2, RDS, ALB configuration)
- **core-services**: Backend services (user-auth, mcp-host, commerce-backend, agentic-chat)

## Contributing

When adding new features:

1. **Maintain read-only focus**: Avoid destructive operations
2. **Add SSH whitelist entries**: If new commands needed
3. **Support both output formats**: Human-readable and JSON
4. **Add interactive prompts**: For missing parameters
5. **Handle errors gracefully**: Use custom error classes
6. **Update documentation**: README.md and CLAUDE.md

## Links

- [Design Document](../../notes-private/projects/Optima Ops CLI 设计方案.md)
- [Main Infrastructure Guide](../../CLAUDE.md)
- [Optima Terraform](../../infrastructure/optima-terraform/CLAUDE.md)
