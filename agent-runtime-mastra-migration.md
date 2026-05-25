# Agent Runtime Mastra In-Process Backlog

## Decision

Use Mastra in-process for the first stable agent-runtime version.

That means each agent instance is a live Mastra `Agent` cached inside the `agent-runtime` Node process. There is no PM2 process per agent. SQLite stores metadata and invocation history, but live agents are recreated after service restart.

## Current Status

- `apps/agent-runtime` compiles and typechecks.
- `POST /admin/agent-runtime/instances` creates a Mastra agent and stores an instance row.
- `POST /instances/:id/invoke` uses `agent.generate()`.
- `POST /instances/:id/invoke/stream` uses `agent.stream()`.
- Live agents are stored in `AgentInvokerService.agentCache`.
- PM2 fields still leak through DB/types even though there is no PM2 lifecycle.
- Dev deployment diagnosis: `agent-runtime` must be running on `3027`; if the frontend on `5173` returns unrelated HTML, it is a stale/wrong dev server. Use the repo frontend dev server or an alternate port such as `5174`.

## Main Risks To Fix

- Instance lifecycle lies: create marks instances online immediately, and returned state may be stale.
- Restart recovery is wrong: DB may say `online` while in-memory cache is empty.
- `invoke` can silently recreate stopped agents.
- Streaming recompiles a Mastra agent per request instead of using the same lifecycle path.
- `tool_access` is only prompt text, not an actual tool filter.
- `env_json` is accepted but not applied to MCP client config.
- Compose preview and real Mastra composition diverge.
- Invocation history inserts duplicate `pending` and `success/error` rows.
- Frontend still displays PM2/process concepts for in-process agents.

## Backend Tasks

### Phase 1 - Honest Lifecycle

- [x] Make `POST /instances` create instances as `stopped` by default.
- [x] Add `auto_start?: boolean` to create instance input.
- [x] If `auto_start` is true, create the DB row, then call `startInstance(id)`.
- [x] Return the fresh DB row after every state transition.
- [x] Make `startInstance` transition `stopped|errored -> starting -> online`.
- [x] Make `startInstance` store resolved skills, MCP servers, composed prompt, and `last_started_at`.
- [x] Make `stopInstance` disconnect MCP client, clear cache, set `stopped`, and store `last_stopped_at`.
- [x] Make `invokeAgent` reject `stopped`, `starting`, `stopping`, and `errored` instances with `409`.
- [x] Reconcile DB on service boot: set `online`, `starting`, and `stopping` instances to `stopped`.

### Phase 2 - Contract Cleanup

- [ ] Deprecate PM2/process fields for agent-runtime: `pm2_name`, `pid`, `uptime_ms`, `restart_count`, `last_exit_code`.
- [ ] Add in-process lifecycle fields:
  - [x] `last_started_at`
  - [x] `last_stopped_at`
  - [x] `last_invoked_at`
  - [x] `last_composed_at`
  - [ ] `cache_status` if useful for debugging
- [ ] Add shared Zod schemas in `packages/types` for create, invoke, compose, and response envelopes.
- [ ] Use shared schemas or inferred types in backend and frontend.
- [ ] Keep wire fields explicit where SQLite stores JSON strings.

### Phase 3 - Composition

- [ ] Unify `AgentComposerService.compose()` and `composeMastra()` behind one composition pipeline.
- [ ] Support dry-run preview and live Mastra creation from the same resolved data.
- [ ] Make missing required skills fail composition.
- [ ] Make missing required MCP servers fail composition.
- [ ] Validate registry responses at runtime with Zod.
- [ ] Add fetch timeouts and contextual errors for registry calls.
- [ ] Ensure `OPENAI_BASE_URL` is applied in the real path, not only in an unused module.

### Phase 4 - MCP And Tool Safety

- [x] Apply `env_json` when building MCP server configs.
- [x] Persist `env_json` securely enough for local/private use, and never log secret values.
- [ ] Fix `buildStdioConfig` argument construction so values are not duplicated.
- [ ] Add an allowlist for stdio commands, initially `npx`, `uvx`, `bunx`, and possibly `node`.
- [x] Decide the default for `tool_access`; recommended: no tools unless explicitly listed.
- [x] Filter Mastra tools by `agent.tool_access` before passing them to `new Agent`.
- [x] Return composition errors when required tools are unavailable.

### Phase 5 - Invocation History

- [x] Change `recordInvocation` to return the inserted invocation id.
- [x] Add `updateInvocation`.
- [x] Insert one `pending` row and update it to `success` or `error`.
- [x] Store duration, output, error, and `last_invoked_at`.
- [x] Add retention, for example keep the latest 100 or 500 invocations per instance.
- [ ] Add foreign key from `agent_invocations.instance_id` to `agent_instances.id` if migration impact is acceptable.

### Phase 6 - Streaming

- [x] Move streaming invocation into `AgentInvokerService`.
- [x] Make streaming use the same cached Mastra agent as non-streaming invoke.
- [x] Make streaming respect lifecycle state.
- [ ] Ensure `mcpClient.disconnect()` runs in `finally` only when the streaming path owns the client.
- [ ] Record streaming invocation history the same way as normal invocation.

### Phase 7 - Errors And Observability

- [ ] Add typed application errors for `not_found`, `invalid_state`, `composition_failed`, `dependency_failed`, and `internal`.
- [ ] Map errors to HTTP codes: `404`, `409`, `422`, `502`, `504`, `500`.
- [ ] Include actionable error messages in API responses.
- [ ] Add structured logs with `instance_id`, `agent_name`, `agent_version`, and `invocation_id`.
- [ ] Add timings for registry resolve, MCP tool load, model generation, and total invocation.
- [ ] Keep `/health` simple.
- [ ] Add `/ready` for DB, registry reachability, and model config presence.

### Phase 8 - Docker And Config

- [x] Either add `apps/agent-runtime/Dockerfile` or remove/fix the compose reference.
- [x] Pass `RUNTIME_URL`, `MASTRA_MODEL`, `OPENAI_BASE_URL`, and `OPENAI_API_KEY` through `docker-compose.yml`.
- [ ] Fail hard in production if `JWT_SECRET` is still the default.
- [ ] Fail hard in production if required model credentials/config are missing.

## Frontend Tasks

### Phase 1 - Remove PM2 Language

- [x] Remove PM2, PID, uptime, restart count, and process labels from `AgentCard.svelte`.
- [ ] Replace process wording with in-process lifecycle wording:
  - [ ] `Online`
  - [ ] `Stopped`
  - [ ] `Starting`
  - [ ] `Stopping`
  - [ ] `Errored`
- [ ] Show clear last error when present.

### Phase 2 - Create Instance UX

- [x] Add `auto_start` toggle to the create form.
- [x] Add `env_json` support as either key/value rows or a JSON textarea.
- [x] Validate JSON client-side before submit.
- [ ] Prefer an agent combobox over manual `agent_name` typing.
- [x] From `/admin/agents`, add a direct action to create an instance for an agent version.

### Phase 3 - Instance Actions

- [ ] Keep actions aligned with backend state:
  - [ ] `Start` only for `stopped` or `errored`.
  - [ ] `Stop` only for `online` or `starting`.
  - [ ] `Invoke` and `Chat` only for `online`.
  - [ ] `Delete` only when not online.
- [ ] Add `Reload` once backend supports stop/start recomposition.
- [ ] Refresh only the affected instance where practical.
- [x] Surface backend/proxy error messages instead of generic `Request failed` responses.

### Phase 4 - Compose Preview

- [ ] Rename to `Preview Composition`.
- [ ] Show dry-run status clearly.
- [ ] Show resolved skills.
- [ ] Show required MCP servers.
- [ ] Show available tools.
- [ ] Show permitted tools after `tool_access` filtering.
- [ ] Show composition warnings/errors before creation.

### Phase 5 - Chat And Invoke

- [x] Make chat selectable instances only include `online`, or disable stopped ones.
- [x] If a selected instance is stopped, offer `Start` rather than sending.
- [ ] Make chat streaming use the same backend error contract.
- [ ] Keep normal invoke and chat behavior consistent.

### Phase 6 - Types

- [ ] Remove duplicated agent-runtime types from `apps/frontend/src/lib/types.ts`.
- [ ] Re-export/import agent-runtime types from `@mcp-nova/types`.
- [ ] Align nullable fields with the backend wire contract.
- [ ] Keep parsed display helpers local to components, not in the API contract.

### Phase 7 - Invocation History UI

- [ ] Add an invocations view per instance.
- [ ] Show input, output, status, duration, created date, and error.
- [ ] Add a lightweight refresh action.
- [ ] Consider a compact drawer/modal from `AgentCard`.

## Recommended Implementation Order

1. Backend honest lifecycle: create stopped, start online, stop stopped, invoke only online.
2. Boot reconciliation.
3. Frontend PM2 removal and action gating.
4. Unified invocation path for non-streaming and streaming.
5. Tool filtering with `tool_access`.
6. `env_json` application.
7. Invocation history update instead of duplicate rows.
8. Shared types and schemas cleanup.
9. Compose preview parity with live composition.
10. Docker/config fixes.

## Verification Checklist

- [x] `npm run typecheck -w @mcp-nova/agent-runtime`
- [x] `npm run build -w @mcp-nova/agent-runtime`
- [x] `npm run check -w @mcp-nova/frontend`
- [x] Manual smoke: `agent-runtime` foreground/background process returns `/health`.
- [x] Manual smoke: `/admin/agent-runtime/instances` returns `401` JSON without token instead of HTML/proxy failure while backend is alive.
- [x] Manual smoke: frontend proxy forwards `/admin/agent-runtime/instances` to `3027` while using the repo frontend.
- [ ] Manual smoke: create instance with `auto_start=false`, verify `stopped`.
- [ ] Manual smoke: start instance, verify `online` and cache-backed invoke.
- [ ] Manual smoke: stop instance, verify invoke returns `409`.
- [ ] Manual smoke: restart `agent-runtime`, verify previously online instances become `stopped`.
- [ ] Manual smoke: streaming chat uses an existing online instance and records one invocation.
