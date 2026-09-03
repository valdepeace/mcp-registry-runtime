# MCP Server Registry

Private MCP (Model Context Protocol) server registry with official registry sync and admin dashboard.

## Features

- **Sync with Official Registry** - Automatic periodic sync from the official MCP registry
- **Skills Catalog** - Skills synced from external providers (Vercel Labs, skills.sh, Smithery)
- **Runtime** - Launch MCP servers from the catalog as PM2 processes, with healthchecks, logs and MCP protocol inspection
- **Private Servers** - Add and manage your own MCP servers
- **Admin Dashboard** - Web UI for managing private servers and monitoring sync status
- **API Compatible** - Compatible with the official MCP Registry API spec
- **Transport Filtering** - Filter servers by transport type (stdio, streamable-http, sse)
- **JWT Authentication** - Secure admin API with JWT tokens

## Project Structure

```
├── apps/
│   ├── registry/     # Express.js catalog API (:3000)
│   ├── runtime/      # Express.js PM2 runtime API (:3001)
│   └── frontend/     # SvelteKit web UI (:5173)
├── packages/
│   └── types/        # Shared Zod schemas and TypeScript types
├── docs/             # Roadmaps and design notes
├── docker-compose.yml
├── nx.json
├── package.json      # Monorepo workspace config
└── AGENTS.md
```

## Quick Start

```bash
# Install all dependencies
npm install

# Start every app in dev mode
npm run dev

# Or start individually
npm run dev:registry   # Registry on http://localhost:3000
npm run dev:runtime    # Runtime on http://localhost:3001
npm run dev:frontend   # Frontend on http://localhost:5173
```

## Docker

```bash
# Build and run all services
docker-compose up -d

# Access:
# - Frontend: http://localhost:5173
# - Registry API: http://localhost:3000
# - Runtime API: http://localhost:3001
```

## Development

### Backends (Express + TypeScript)

```bash
cd apps/registry   # or apps/runtime
npm install
npm run dev        # Hot reload dev server
npm run build      # Compile TypeScript
npm run typecheck  # Type checking
```

### Frontend (SvelteKit + Tailwind)

```bash
cd apps/frontend
npm install
npm run dev        # Dev server with HMR
npm run build      # Build for production
npm run check      # Svelte type checking
```

## API Endpoints

### Public API (`/v0.1/*`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/v0.1/servers` | List servers (supports search, transport_type, source filters) |
| GET | `/v0.1/servers/:name/versions` | List all versions of a server |
| GET | `/v0.1/servers/:name/versions/:version` | Get specific version |
| GET | `/v0.1/transports` | List transport types |

### Admin API (`/admin/*`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/admin/login` | Get JWT token |
| GET | `/admin/me` | Current user info |
| GET | `/admin/stats` | Registry statistics |
| GET | `/admin/sync/status` | Sync status |
| POST | `/admin/sync/trigger` | Force sync |
| POST | `/admin/servers` | Create private server |
| PUT | `/admin/servers/:name/versions/:version` | Update server |
| DELETE | `/admin/servers/:name/versions/:version` | Delete version |
| DELETE | `/admin/servers/:name` | Delete all versions |

## Configuration

### Backend Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3000 | Server port |
| `OFFICIAL_REGISTRY_URL` | https://registry.modelcontextprotocol.io | Official registry |
| `SYNC_INTERVAL_MS` | 300000 | Sync interval (5 min) |
| `SYNC_ON_STARTUP` | true | Sync when starting |
| `DB_PATH` | `<workspace-root>/mcp-registry-runtime-data/registry.db` | SQLite database path |
| `JWT_SECRET` | - | JWT signing secret |
| `ADMIN_USERNAME` | admin | Initial admin user |
| `ADMIN_PASSWORD` | admin | Initial admin password |

`apps/runtime` has its own `DB_PATH`, defaulting to
`<workspace-root>/mcp-registry-runtime-data/runtime.db`.

### Where the database lives

Both backends default `DB_PATH` to a fixed folder next to the repo clone
itself, not to `process.cwd()` and not to an OS temp/app-data dir:

```
<workspace-root>/mcp-registry-runtime-data/
├── registry.db   # apps/registry
└── runtime.db    # apps/runtime
```

`<workspace-root>` is computed at startup as the parent folder of this
repo — i.e. wherever you ran `git clone` — so every service and every
teammate lands on the same DB location with zero configuration, regardless
of whether you launch via `nx`, `pm2`, or a plain `node dist/index.js` from
a different `cwd`. Set `DB_PATH` in `.env` to override it (see
`apps/registry/.env.example` / `apps/runtime/.env.example`). Docker images
are unaffected — they always use the absolute `/app/data/*.db` path set in
`docker-compose.yml`.

## License

MIT
