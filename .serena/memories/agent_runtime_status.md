---
name: Agent Runtime Backlog Status
description: Current progress on agent-runtime Mastra migration — what's done, what's pending
type: project
---

Full backlog in: `agent-runtime-mastra-migration.md` (project root).

## Architecture decision

Mastra **in-process** per agent-runtime process — no PM2 per agent. Live agents cached in `AgentInvokerService.agentCache`. SQLite stores metadata and history. Cache cleared on service restart (boot reconciliation resets online→stopped).

## Completed phases

- **Phase 1 (Lifecycle)**: create→stopped, auto_start, start/stop transitions, boot reconciliation, invoke rejects non-online with 409
- **Phase 4 (MCP/Tool)**: env_json applied, tool_access filters tools, composition errors for missing tools
- **Phase 5 (Invocation history)**: single pending row → update to success/error, duration stored, retention (latest 100-500)
- **Phase 6 (Streaming)**: uses cached agent, respects lifecycle
- **Phase 8 (Docker)**: Dockerfile exists, compose passes env vars
- **Frontend Phase 1**: PM2 fields removed from AgentCard
- **Frontend Phase 2**: auto_start toggle, env_json editor, proxy errors surfaced

## Pending phases

- **Phase 2**: Deprecate PM2 fields (pm2_name, pid, uptime_ms, restart_count, last_exit_code); shared Zod schemas in packages/types
- **Phase 3**: Unify compose()/composeMastra(), fail on missing required skills/MCP servers, fetch timeouts
- **Phase 4 remainder**: Fix buildStdioConfig arg duplication, add stdio command allowlist (npx/uvx/bunx/node)
- **Phase 6 remainder**: mcpClient.disconnect() in finally only when streaming owns it; record streaming history
- **Phase 7**: Typed errors (not_found/invalid_state/composition_failed), structured logs, /ready endpoint
- **Frontend Phase 3**: Action gating by state (Start only stopped/errored, Stop only online/starting, Invoke only online)
- **Frontend Phase 4**: Compose preview UI (dry-run, resolved skills, available tools, tool_access filter result)
- **Frontend Phase 5**: Streaming chat error contract, consistent invoke/chat behavior
- **Frontend Phase 6**: Remove duplicate types from types.ts → use @mcp/types
- **Frontend Phase 7**: Invocation history view per instance

## New files added (not yet committed)

- `apps/agent-runtime/src/mastra/` — Mastra agent factory
- `apps/agent-runtime/src/routes/ollama.routes.ts` + `services/ollama.service.ts` — Ollama support
- `apps/frontend/src/lib/components/AgentCard|AgentCombobox|LaunchModal|ProviderCard.svelte`
- `apps/frontend/src/routes/admin/agent-runtime/chat/` — chat UI
- `apps/frontend/src/routes/admin/ollama/` — Ollama admin
- `apps/registry/src/services/providers/` — Smithery + skills-sh providers
- `apps/registry/src/services/seed.service.ts` + `sync-event-bus.ts`
- `apps/runtime/src/services/git.service.ts`
- `packages/types/src/agent-runtime.ts` — shared agent-runtime types

## Recommended next steps (priority order)

1. Frontend Phase 3: action gating by lifecycle state
2. Phase 3: unify composition pipeline
3. Phase 7: typed errors + /ready endpoint
4. Frontend Phase 6: types cleanup
