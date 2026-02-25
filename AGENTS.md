# AGENTS.md

## Cursor Cloud specific instructions

### Overview

Gestor de Tareas is a full-stack Node.js/Express web application for managing tasks on an interactive floor plan. It uses SQLite (file-based, no external DB required) and serves a vanilla JS frontend SPA.

### Running the application

- **Dev mode:** `node src/server.js` (or `npm start`) — listens on port 3000
- **Dev mode with watch:** `node --watch src/server.js` (auto-restarts on file changes)
- No build step is required for the frontend (vanilla JS served statically by Express)
- The SQLite database is auto-created at `data/data.db` on first run
- The `uploads/` directory is used for file storage; create it if missing: `mkdir -p data uploads`

### Auth in development

- When `NODE_ENV !== "production"` and no `API_KEY` env var is set, the auth middleware grants admin access to all requests automatically (no token needed for API calls)
- To test with authentication, register a user via `POST /v1/auth/register` and login via `POST /v1/auth/login` to get a JWT token
- Default JWT secret in dev: `dev-secret-key-12345`

### Commands

| Task | Command |
|------|---------|
| Start (dev) | `npm start` or `node src/server.js` |
| Tests | `npm test` |
| Lint | `npm run lint` |
| Lint fix | `npm run lint:fix` |

### Gotchas

- The map section in the UI appears blank without a configured floor plan image — this is expected in a fresh setup (the default `plano.jpg` is bundled in `src/public/ui/`)
- Lint has ~41 pre-existing errors (mostly unused variables); these are known and not blockers
- CSRF is disabled by default (`CSRF_ENABLED = false` in `app.js`)
- Tests create their own temporary SQLite DB and clean up after themselves; they do not affect the main `data/data.db`
- Email notifications require an SMTP server (Mailpit via Docker for dev); the app runs fine without one
- The `docker-compose.yml` is configured for `linux/arm64` platform; for x86 hosts, remove or change the `platform` field
