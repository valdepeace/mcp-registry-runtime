---
name: Project Overview
description: High-level description of the mcp-nova project
type: project
---

Private MCP (Model Context Protocol) server registry monorepo.

**Purpose**: Syncs with the official MCP registry, supports adding private servers, and manages runtime MCP server processes via PM2.

**Two apps**:
- `apps/backend`: Express.js + TypeScript (ESM) + SQLite (better-sqlite3) API
- `apps/frontend`: SvelteKit 5 + Tailwind CSS v4 dashboard

**Why**: Personal/NTT DATA internal tool for managing a catalog of MCP servers and running them locally via PM2.

**How to apply**: All new features should follow the separation between "catalog" (what MCPs exist) and "runtime" (what MCPs are running). Backend is synchronous DB only.
