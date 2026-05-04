---
name: Suggested Commands
description: Key development commands for the mcp-nova project
type: project
---

# Development
```bash
npm install                          # Install all dependencies
npm run dev                          # Both apps (backend :3000, frontend :5173)
npm run dev:backend                  # Backend only (tsx watch)
npm run dev:frontend                 # Frontend only (Vite HMR)
```

# Build & Check
```bash
npm run build                        # Build all workspaces
npm run typecheck                    # Type check all workspaces
cd apps/frontend && npm run check    # svelte-check + TypeScript
```

# Workspace-specific
```bash
npm run build -w @mcp-nova/backend
npm run build -w @mcp-nova/frontend
```

# Docker
```bash
docker-compose up -d
```

# PM2 (runtime management)
```bash
pm2 list
pm2 logs
pm2 monit
pm2 describe mcp--org-name--1.0
```

# System tools (Windows)
- Shell: bash (Git Bash / WSL). Use Unix paths (forward slashes).
- `ls`, `find`, `grep` work in bash context.
