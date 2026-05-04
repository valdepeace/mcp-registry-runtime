---
name: Backend Conventions
description: Code style and conventions for the Express.js backend
type: project
---

- **ESM imports require `.js` extension** even for `.ts` source files
- **Synchronous DB only** — better-sqlite3 is sync, no async/await for DB
- **Always `return` after `res.send()`/`res.json()`**
- **Zod validation via middleware**: `validateBody()`, `validateQuery()`, `validateParams()`
- **Server names contain `/`** — use `encodeURIComponent` in URL paths
- **Official servers are immutable** (source='official')
- **PM2 process names**: `/` → `--`, `@` → `-at-`, prefix `mcp--`
- **Express 5**: validated values in `req.validatedQuery` / `req.validatedParams` (not req.query/params — read-only in Express 5)
- **SSE endpoints**: accept JWT via `?token=` query param
- **PM2 state eager sync**: `GET /admin/runtime/instances` runs `pm2 jlist` before responding
- **Custom metadata**: `com.mcp-nova.meta` key inside server `_meta`
- Services exported as singletons (instance, not class)
