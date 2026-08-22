---
name: Project Overview
description: High-level description of the mcp-registry-runtime project — 4-app monorepo with registry, runtime, agent-runtime, and frontend
type: project
---

Private MCP (Model Context Protocol) server registry monorepo. Project name: **mcp-registry-runtime**.

**Purpose**: Syncs with the official MCP registry, supports private server catalog, manages MCP server processes via PM2, and runs AI agents using Mastra in-process.

**4 apps + 1 shared package**:
| Workspace | Package | Port | Purpose |
|-----------|---------|------|---------|
| `apps/registry` | `@mcp/registry` | 3000 | MCP server catalog — official sync + private servers + skills |
| `apps/runtime` | `@mcp/runtime` | 3001 | PM2-managed MCP server process lifecycle |
| `apps/agent-runtime` | `@mcp/agent-runtime` | 3027 | Mastra in-process AI agents — create, start, stop, invoke, stream |
| `apps/frontend` | `@mcp/frontend` | 5173 | SvelteKit 5 admin dashboard |
| `packages/types` | `@mcp/types` | — | Shared Zod schemas + TypeScript types |

**Key architectural decisions**:
- `agent-runtime` uses Mastra **in-process** — no PM2 per agent, agents cached in `AgentInvokerService.agentCache`
- SQLite (better-sqlite3, synchronous) across all backend apps
- `apps/registry` is the source of truth for MCP servers and skills; `source='official'` rows are immutable
- Frontend proxies API calls to backends (Vite dev proxy or nginx in prod)
- `packages/types` hosts shared Zod schemas — backends and frontend should import from there

**Current focus**: agent-runtime Mastra integration — lifecycle, composition, invocation history, streaming.
