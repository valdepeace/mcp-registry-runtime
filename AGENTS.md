# AGENTS.md

Private MCP server registry monorepo — split into registry backend, runtime backend, agent-runtime backend, and SvelteKit frontend. Registry syncs official MCP registry and manages private servers. Runtime runs MCP server processes via PM2 and provides MCP protocol inspection. Agent-runtime composes agents (skills + MCP servers from the registry) and manages agent processes.

## Commands

```bash
# Root (npm workspaces at apps/*)
npm install
npm run dev                  # All apps (registry :3000, runtime :3001, agent-runtime :3027, frontend :5173)
npm run dev:registry         # Registry :3000
npm run dev:runtime          # Runtime :3001
npm run dev:agent-runtime    # Agent Runtime :3027
npm run dev:frontend         # Frontend :5173 (proxies to registry, runtime, agent-runtime)
npm run build                # All workspaces
npm run typecheck            # All workspaces

# Workspace-scoped
npm run build -w @mcp-nova/registry
npm run build -w @mcp-nova/runtime
npm run build -w @mcp-nova/agent-runtime
npm run build -w @mcp-nova/frontend
cd apps/registry && npm run typecheck
cd apps/runtime && npm run typecheck
cd apps/agent-runtime && npm run typecheck
cd apps/frontend && npm run check

# Docker
docker-compose up -d        # Registry :3000, Runtime :3001, Agent Runtime :3027, Frontend :5173
```

No test framework is configured.

## Architecture

```
apps/registry/       @mcp-nova/registry       Express 5 + TypeScript ESM + SQLite (servers, users, sync)
apps/runtime/        @mcp-nova/runtime        Express 5 + TypeScript ESM + SQLite (instances, inspect) + PM2
apps/agent-runtime/  @mcp-nova/agent-runtime  Express 5 + TypeScript ESM + SQLite (agent_instances, invocations) + PM2
apps/frontend/       @mcp-nova/frontend       SvelteKit 5 + Tailwind v4 (static adapter, SPA fallback)
packages/types/      @mcp-nova/types          Shared TypeScript types + Zod schemas
```

### Registry — entry: `apps/registry/src/index.ts` (port 3000)
- **Routes**: `public.routes.ts` (`/v0.1`), `admin.routes.ts` (`/admin` — server CRUD, auth, sync, stats)
- **Services**: `databaseService` (servers, users, sync_status), `syncService`, `officialRegistryService`
- **Middleware**: JWT auth, Zod validation

### Runtime — entry: `apps/runtime/src/index.ts` (port 3001)
- **Routes**: `runtime.routes.ts` mounted at `/admin/runtime`
- **Services**: `databaseService` (runtime_instances, inspect_history), `runtimeService`, `pm2Service`, `runtimeEventBus`, `mcpInspectorService`
- **Middleware**: JWT auth (shared secret), Zod validation
- **Inter-service**: `from-catalog` route calls registry backend via `REGISTRY_URL`

### Agent Runtime — entry: `apps/agent-runtime/src/index.ts` (port 3027)
- **Routes**: `agent-runtime.routes.ts` mounted at `/admin/agent-runtime`
- **Services**: `databaseService` (agent_instances, agent_invocations), `agentComposerService`, `agentInvokerService`
- **Middleware**: JWT auth (shared secret), Zod validation
- **Inter-service**: `compose` resolves skills + MCP servers from registry (`REGISTRY_URL`) and may reference runtime instances (`RUNTIME_URL`)

### Frontend routes

| Path | Page |
|------|------|
| `/` | Server browser (search, filters, pagination) |
| `/login` | Login |
| `/admin` | Dashboard, stats, private servers |
| `/admin/runtime` | Runtime instance management |
| `/admin/agent-runtime` | Agent instance management |
| `/admin/pm2` | PM2 metrics dashboard |
| `/admin/servers/new/` | Create server |
| `/servers/[name]/` | Server detail |

## Backend conventions (both apps)

- **ESM imports require `.js` extension** — `import { config } from './config/index.js'`
- **Synchronous DB only** — better-sqlite3 has no async. DB operations do not use async/await.
- **Source field is `'registry'`** (not `'official'`) — a migration renamed `official` → `registry`. Immutability checks use `WHERE source != 'registry'`.
- **Server names contain `/`** — always `encodeURIComponent` in URLs, `decodeURIComponent` to read back
- **PM2 process naming**: `mcp--{sanitized}--{version}` where `/` → `--`, `@` → `-at-`
- **Express 5 readonly params/query** — validated values on `(req as any).validatedQuery` / `(req as any).validatedParams`
- **SSE JWT via query param** — `EventSource` can't set headers, so `/admin/runtime/events` accepts `?token=...`
- **PM2 state is eagerly synced** — `GET /admin/runtime/instances` calls `pm2 jlist` and updates DB before responding
- **Custom metadata namespace** — `com.mcp-nova.meta` in `_meta` for verified/featured/tags/category/license
- **Always `return` after `res.json()`/`res.send()`** to avoid double-header errors
- **Runtime health check** — HTTP 406 (MCP streamable) is treated as healthy
- **Inspect history capped at 100** per instance, older entries auto-deleted

## Frontend conventions

- **Svelte 5 runes**: `$state`, `$derived`, `$effect`, `$props`, `$bindable`
- **Tailwind v4**: `@import "tailwindcss"` in `app.css` + `@tailwindcss/vite` plugin
- **Static SPA**: adapter-static with `fallback: 'index.html'`
- **Path aliases**: `$lib` → `src/lib`, `$components` → `src/lib/components`
- **API client**: empty base URL, relies on Vite proxy (dev) or nginx (prod) to route `/v0.1/*` and `/admin/*` to registry, `/admin/runtime/*` to runtime, `/admin/agent-runtime/*` to agent-runtime
- **Auth store**: `writable`/`derived` from `svelte/store`, token in localStorage
- **SSE runtime events**: `EventSource` subscribing to `/admin/runtime/events?token=...`
- **Type-only imports**: `import type { Foo }` for types

## Configuration

### Registry `.env` (see `apps/registry/.env.example`)

| Variable | Default | Notes |
|----------|---------|-------|
| `NODE_ENV` | `development` | |
| `PORT` | `3000` | |
| `DB_PATH` | `./data/registry.db` | SQLite, volume mount in Docker |
| `JWT_SECRET` | — | Change in production, shared with runtime |
| `JWT_EXPIRES_IN` | `24h` | |
| `ADMIN_USERNAME` | `admin` | Initial bootstrap user |
| `ADMIN_PASSWORD` | `admin` | Initial bootstrap user |
| `OFFICIAL_REGISTRY_URL` | `https://registry.modelcontextprotocol.io` | |
| `SYNC_INTERVAL_MS` | `300000` | 5 min |
| `CORS_ORIGINS` | `*` | Comma-separated |

### Runtime `.env` (see `apps/runtime/.env.example`)

| Variable | Default | Notes |
|----------|---------|-------|
| `NODE_ENV` | `development` | |
| `PORT` | `3001` | |
| `DB_PATH` | `./data/runtime.db` | SQLite, volume mount in Docker |
| `JWT_SECRET` | — | Must match registry |
| `CORS_ORIGINS` | `*` | Comma-separated |
| `REGISTRY_URL` | `http://localhost:3000` | Internal HTTP call for from-catalog |

### Agent Runtime `.env` (see `apps/agent-runtime/.env.example`)

| Variable | Default | Notes |
|----------|---------|-------|
| `NODE_ENV` | `development` | |
| `PORT` | `3027` | |
| `DB_PATH` | `./data/agent-runtime.db` | SQLite, volume mount in Docker |
| `JWT_SECRET` | — | Must match registry |
| `CORS_ORIGINS` | `*` | Comma-separated |
| `REGISTRY_URL` | `http://localhost:3000` | Internal HTTP call for compose |
| `RUNTIME_URL` | `http://localhost:3001` | Internal HTTP call for runtime references |

Default admin: `admin` / `admin`

## Docker notes

- better-sqlite3 is a native module — requires `npm rebuild better-sqlite3` in Docker (Node 22-alpine)
- Volumes: `registry-data`, `runtime-data`, and `agent-runtime-data` mounted at `/app/data` for SQLite persistence
