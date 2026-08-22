---
name: Suggested Commands
description: Key development commands for the mcp-registry-runtime project (4-app monorepo)
type: project
---

# Development

```bash
npm install                          # Install all dependencies

npm run dev                          # All 4 apps: registry:3000, runtime:3001, agent-runtime:3027, frontend:5173
npm run dev:registry                 # Registry only
npm run dev:runtime                  # Runtime only
npm run dev:agent-runtime            # Agent-runtime only
npm run dev:frontend                 # Frontend only (Vite HMR, proxies to backends)
```

# Build & Check

```bash
npm run build                        # Build all workspaces
npm run typecheck                    # Type check all workspaces

# Workspace-specific
npm run build -w @mcp/registry
npm run build -w @mcp/runtime
npm run build -w @mcp/agent-runtime
npm run build -w @mcp/frontend
npm run typecheck -w @mcp/agent-runtime

# Frontend Svelte check
cd apps/frontend && npm run check    # svelte-check + TypeScript
npm run check -w @mcp/frontend
```

# Docker

```bash
docker-compose up -d
```

# PM2 (MCP server runtime management)

```bash
pm2 list
pm2 logs
pm2 monit
pm2 describe mcp--org-name--1.0
```

# Agent-runtime smoke tests

```bash
# Health check
curl http://localhost:3027/health

# Auth check (should return 401 JSON, not HTML)
curl http://localhost:3027/admin/agent-runtime/instances
```

# System

- Shell: PowerShell (Windows 11). Use PowerShell syntax.
- Git Bash also available for Unix-style commands.
