# MCP Server Registry

Private MCP (Model Context Protocol) server registry with official registry sync and admin dashboard.

## Features

- **Sync with Official Registry** - Automatic periodic sync from the official MCP registry
- **Private Servers** - Add and manage your own MCP servers
- **Admin Dashboard** - Web UI for managing private servers and monitoring sync status
- **API Compatible** - Compatible with the official MCP Registry API spec
- **Transport Filtering** - Filter servers by transport type (stdio, streamable-http, sse)
- **JWT Authentication** - Secure admin API with JWT tokens

## Project Structure

```
├── apps/
│   ├── backend/      # Express.js API server
│   │   ├── src/
│   │   ├── package.json
│   │   └── Dockerfile
│   └── frontend/     # SvelteKit web UI
│       ├── src/
│       ├── package.json
│       └── Dockerfile
├── docker-compose.yml
├── package.json      # Monorepo workspace config
└── AGENTS.md
```

## Quick Start

```bash
# Install all dependencies
npm install

# Start both backend and frontend in dev mode
npm run dev

# Or start individually
npm run dev:backend   # Backend on http://localhost:3000
npm run dev:frontend  # Frontend on http://localhost:5173
```

## Docker

```bash
# Build and run all services
docker-compose up -d

# Access:
# - Frontend: http://localhost:5173
# - Backend API: http://localhost:3000
```

## Development

### Backend (Express + TypeScript)

```bash
cd apps/backend
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
| `DB_PATH` | ./data/registry.db | SQLite database path |
| `JWT_SECRET` | - | JWT signing secret |
| `ADMIN_USERNAME` | admin | Initial admin user |
| `ADMIN_PASSWORD` | admin | Initial admin password |

## License

MIT
