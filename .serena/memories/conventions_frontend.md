---
name: Frontend Conventions
description: Code style and conventions for the SvelteKit 5 frontend (apps/frontend)
type: project
---

## Svelte / TypeScript

- **Svelte 5 runes**: `$state`, `$derived`, `$effect`, `$props` — NOT legacy reactive declarations (`$:`, stores)
- **Two-way binding**: `$bindable()` for props that parent can `bind:` to
- **Type-only imports**: `import type { Foo }`
- **Path aliases**: `$lib` and `$components`
- Serena does NOT process `.svelte` files (TypeScript language only) — use Read tool for Svelte files

## Styling

- **Tailwind CSS v4**: `@import "tailwindcss"` in CSS (CSS-first config, no `@tailwind` directives)

## Build / Deploy

- **Static adapter**: builds to `build/`, served by nginx in prod with SPA fallback

## Routes (file-based)

- `/` — server catalog
- `/servers/[name]` — server detail
- `/admin` — admin dashboard
- `/admin/servers/new` — add private server
- `/admin/runtime` — PM2 MCP runtime instances
- `/admin/agent-runtime` — Mastra agent instances
- `/admin/agent-runtime/chat` — chat UI for online agents
- `/admin/agents` — agent definitions
- `/admin/skills` — skills catalog
- `/admin/ollama` — Ollama model management

## Components (`src/lib/components/`)

Core: `ServerCard`, `ServerCombobox`, `Filters`, `SearchInput`, `CreateRuntimeForm`
Agent-runtime: `AgentCard`, `AgentCombobox`, `LaunchModal`, `ProviderCard`
All re-exported from `index.ts`

## API client

`src/lib/api/client.ts` — fetch wrapper with JWT auth. Proxied to backends via Vite dev proxy or nginx.

## Types

- `src/lib/types.ts` — local types (in progress: migrate to `@mcp-nova/types`)
- Agent-runtime types should come from `packages/types/src/agent-runtime.ts` (pending cleanup)
