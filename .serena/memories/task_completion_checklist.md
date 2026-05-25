---
name: Task Completion Checklist
description: What to verify after completing a development task in mcp-nova
type: project
---

After completing a task:

1. `npm run typecheck` — verify no TypeScript errors across all workspaces
2. `cd apps/frontend && npm run check` — svelte-check for frontend
3. No test framework configured — manual smoke testing required
4. For backend changes: verify routes in the relevant `src/routes/` match service methods
5. For frontend changes: start dev server (`npm run dev:frontend`) and test in browser
6. No linter configured — follow existing code style

## agent-runtime specific checklist

- [ ] `npm run typecheck -w @mcp-nova/agent-runtime`
- [ ] `npm run build -w @mcp-nova/agent-runtime`
- [ ] `npm run check -w @mcp-nova/frontend`
- [ ] `curl http://localhost:3027/health` returns 200
- [ ] `curl http://localhost:3027/admin/agent-runtime/instances` returns 401 JSON (not HTML/proxy error)
- [ ] Manual: create instance with `auto_start=false` → verify status=`stopped`
- [ ] Manual: start instance → verify status=`online`, invoke works
- [ ] Manual: stop instance → verify invoke returns 409
- [ ] Manual: restart agent-runtime → previously online instances become `stopped`
- [ ] Manual: streaming chat uses online instance, records one invocation row
