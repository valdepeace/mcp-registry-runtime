# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Private MCP (Model Context Protocol) server registry monorepo. Syncs with the official MCP registry, supports adding private servers, and manages runtime MCP server processes via PM2. Two apps: Express.js backend API + SvelteKit frontend dashboard.

## Commands

```bash
# Install all dependencies
npm install

# Development (both apps)
npm run dev

# Individual apps
npm run dev:backend          # Backend on :3000 (tsx watch)
npm run dev:frontend         # Frontend on :5173 (Vite HMR, proxies to backend)

# Build
npm run build                # Build all workspaces
npm run typecheck            # Type check all workspaces

# Workspace-specific
npm run build -w @mcp-nova/backend
npm run build -w @mcp-nova/frontend

# Frontend-specific checks
cd apps/frontend && npm run check    # svelte-check + TypeScript

# Docker
docker-compose up -d
```

No test framework is configured yet.

## Architecture

**Monorepo** using npm workspaces (`apps/backend`, `apps/frontend`).

### Backend (`apps/backend`) - Express.js + TypeScript (ESM)

- **Entry**: `src/index.ts` - Express app bootstrap, graceful shutdown
- **Routes**: `src/routes/` - public (`/v0.1/*`), admin (`/admin/*`), runtime (`/admin/runtime/*`)
- **Services**: `src/services/` - database (SQLite via better-sqlite3), sync, official-registry, PM2, runtime, event-bus (EventEmitter for SSE streaming)
- **Middleware**: JWT auth (`auth.middleware.ts`), Zod validation (`validation.middleware.ts`)
- **Models**: `src/models/` - Zod schemas for request validation
- **Types**: `src/types/` - TypeScript interfaces

Services are exported as singletons (class instance, not class). Database is SQLite with synchronous better-sqlite3. PM2 is called via CLI (`child_process`), not the SDK.

### Frontend (`apps/frontend`) - SvelteKit 5 + Tailwind CSS v4

- **Routes**: `src/routes/` - file-based routing (home, login, admin dashboard, server detail, runtime management)
- **Components**: `src/lib/components/` - reusable Svelte components, re-exported from `index.ts`
- **API Client**: `src/lib/api/client.ts` - fetch wrapper with JWT auth
- **Auth Store**: `src/lib/stores/auth.ts` - Svelte writable/derived stores
- **Static adapter**: builds to `build/`, served by nginx in production with SPA fallback

### Data Flow

1. Backend syncs official MCP registry periodically -> SQLite `servers` table (source='official', immutable)
2. Admin creates private servers -> stored with source='private'
3. Runtime instances reference servers by name/version, PM2 manages processes
4. Frontend proxies API calls to backend (Vite dev proxy or nginx in prod)

## Key Conventions

### Backend

- **ESM imports require `.js` extension** even for `.ts` source files: `import { foo } from './foo.js'`
- **Synchronous DB calls only** - better-sqlite3 is sync, no async/await for database operations
- **Always return after `res.send()`/`res.json()`** to prevent double-header errors
- **Zod validation via middleware**: use `validateBody()`, `validateQuery()`, `validateParams()` on routes
- **Server names contain `/`** - use `encodeURIComponent` in URL paths
- **Official servers are immutable** - cannot update/delete servers with `source='official'`
- **PM2 process names** are URL-safe: `/` replaced with `--`, `@` replaced with `-at-`, prefixed with `mcp--`
- **Express 5 read-only query/params**: validated values land in `req.validatedQuery` / `req.validatedParams`, not `req.query` / `req.params` (Express 5 made those read-only)
- **SSE endpoints accept JWT via `?token=` query param** - `EventSource` cannot set custom headers, so runtime event streams pass the token in the URL
- **PM2 state is eagerly synced**: `GET /admin/runtime/instances` runs `pm2 jlist` and updates the DB before responding
- **Custom metadata namespace**: `com.mcp-nova.meta` key inside server `_meta` carries verified, featured, tags, category, license without conflicting with the official registry spec

### Frontend

- **Svelte 5 runes**: `$state`, `$derived`, `$effect`, `$props` - not legacy reactive declarations
- **Tailwind CSS v4**: uses `@import "tailwindcss"` (CSS-first), not `@tailwind` directives
- **Type-only imports**: use `import type { Foo }` for types
- **Path aliases**: `$lib` and `$components` for imports
- **Two-way binding**: `$bindable()` for props that parent can `bind:` to

## Configuration

Backend configured via `.env` file (see `apps/backend/.env.example`). Key variables: `PORT`, `DB_PATH`, `JWT_SECRET`, `ADMIN_USERNAME`/`ADMIN_PASSWORD`, `SYNC_INTERVAL_MS`, `SYNC_ON_STARTUP`.

Default admin credentials: `admin` / `admin`.

## Docker

`docker-compose.yml` runs both services. Note: better-sqlite3 is a native module requiring rebuild in containers (Node 22-alpine).
