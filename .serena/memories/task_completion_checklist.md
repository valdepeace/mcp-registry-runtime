---
name: Task Completion Checklist
description: What to do after completing a development task
type: project
---

After completing a task:
1. `npm run typecheck` — verify no TypeScript errors across all workspaces
2. `cd apps/frontend && npm run check` — svelte-check for frontend
3. No test framework configured yet — manual testing via API or UI
4. For backend changes: verify routes in `apps/backend/src/routes/` match services
5. For frontend changes: start dev server and test the feature in browser
6. No linter configured — follow existing code style
