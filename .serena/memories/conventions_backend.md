---
name: Backend Conventions
description: Code style and conventions for all Express.js backend apps (registry, runtime, agent-runtime)
type: project
---

## All backends (registry, runtime, agent-runtime)

- **ESM imports require `.js` extension** even for `.ts` source files: `import { foo } from './foo.js'`
- **Synchronous DB only** — better-sqlite3 is sync, never use async/await for DB operations
- **Always `return` after `res.send()`/`res.json()`** to prevent double-header errors
- **Zod validation via middleware**: `validateBody()`, `validateQuery()`, `validateParams()`
- **Express 5**: validated values in `req.validatedQuery` / `req.validatedParams` — req.query/params are read-only in Express 5
- **SSE endpoints**: accept JWT via `?token=` query param (EventSource can't set custom headers)
- Services exported as singletons (class instance, not class)

## registry-specific

- **Official servers immutable**: cannot update/delete `source='official'` rows
- **Server names contain `/`** — use `encodeURIComponent` in URL paths
- **Custom metadata**: `com.mcp-nova.meta` key inside `_meta` (verified, featured, tags, category, license)
- Providers: `smithery-servers.provider.ts`, `smithery-skills.provider.ts`, `skills-sh.provider.ts`
- Sync event bus: `sync-event-bus.ts` for SSE streaming of sync progress

## runtime-specific

- **PM2 process names**: `/` → `--`, `@` → `-at-`, prefix `mcp--`
- **PM2 state eager sync**: `GET /admin/runtime/instances` runs `pm2 jlist` and updates DB before responding
- PM2 called via CLI (`child_process`), not the SDK

## agent-runtime-specific

- Agents are **Mastra in-process** — no PM2 per agent
- Live agents cached in `AgentInvokerService.agentCache` (Map<instanceId, Agent>)
- Instance lifecycle states: `stopped` → `starting` → `online` → `stopping` → `stopped` | `errored`
- **Create defaults to `stopped`**; use `auto_start: true` to start immediately
- **Boot reconciliation**: on service start, set `online`/`starting`/`stopping` rows → `stopped`
- **invoke/stream reject non-online instances with 409**
- `env_json` applied to MCP client configs (never logged)
- `tool_access` filters Mastra tools before passing to `new Agent`
- Invocation history: one `pending` row → update to `success`/`error` (no duplicate rows)
- Streaming uses the **same cached Mastra agent** as non-streaming invoke
