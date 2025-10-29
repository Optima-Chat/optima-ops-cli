# @optima-chat/ops-cli - Claude Code Integration

> **System Operations CLI - Development Guide**

## Project Overview

DevOps and monitoring tool for Optima infrastructure.

**Target Users**: SRE and DevOps teams
**Key Features**: Service health, database monitoring, infrastructure metrics, log analysis, alerts

## Quick Commands

```bash
pnpm install
pnpm build
pnpm link
optima-ops --help
```

## Command Modules

- **services/** - Health checks, response time, error rates, SLA
- **database/** - Connections, slow queries, locks, size
- **infra/** - EC2, Docker, disk, network
- **logs/** - Error logs, anomaly detection, search
- **workspace/** - MCP workspace container monitoring
- **alerts/** - Alert summary, deployment history

## Data Sources

- AWS CloudWatch (metrics and logs)
- Docker API (container stats via SSH)
- Service health endpoints (/health, /metrics)
- PostgreSQL system views (pg_stat_*)

## Related Documentation

- [Architecture](https://github.com/Optima-Chat/optima-cli-docs/blob/main/ARCHITECTURE.md)
- [cli-core Documentation](../../optima-cli-core/README.md)

---

**Last Updated**: 2025-10-29
