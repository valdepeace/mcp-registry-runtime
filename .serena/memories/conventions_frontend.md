---
name: Frontend Conventions
description: Code style and conventions for the SvelteKit 5 frontend
type: project
---

- **Svelte 5 runes**: `$state`, `$derived`, `$effect`, `$props` — NOT legacy reactive declarations
- **Tailwind CSS v4**: `@import "tailwindcss"` (CSS-first, no `@tailwind` directives)
- **Type-only imports**: `import type { Foo }`
- **Path aliases**: `$lib` and `$components`
- **Two-way binding**: `$bindable()` for props that parent can `bind:` to
- **Static adapter**: builds to `build/`, served by nginx in prod with SPA fallback
- Serena does NOT process `.svelte` files (TypeScript language only) — use Read tool for Svelte
