# context for Gemini CLI

## Project Overview
**Gestor de Tareas sobre Plano** is a task management web application that allows users to create and manage tasks positioned on a local technical map or image. 

- **Backend:** Node.js with Express.
- **Database:** SQLite for persistent storage.
- **Frontend:** Vanilla JavaScript (ES6+), HTML5, and CSS3. It uses Leaflet.js for interactive map functionality (`L.imageOverlay`).
- **Infrastructure:** Docker and Docker Compose. Caddy is used as a reverse proxy with local TLS support.
- **Security:** JWT-based authentication with Role-Based Access Control (Admin/User), CSRF protection (optional), and Rate Limiting.

## Core Mandates & Conventions
- **Modules:** Use ES6 modules for the frontend (`src/public/ui/modules/`) and CommonJS for the backend.
- **Validations:** Backend uses **Zod** for schema validation (found in `src/schemas/`).
- **Database:** Use the helpers in `src/db/sqlite.js` (`run`, `get`, `all`) for database interactions.
- **File Uploads:** Managed via Multer. Files are stored in the `uploads/` directory, with automatically generated thumbnails in `uploads/thumbs/` using Sharp.
- **Audit Logs:** All changes to tasks (issues) are logged in the `issue_logs` table.
- **Emails:** Handled via `nodemailer` in `src/services/mail.service.js`.

## Building and Running

### Docker (Recommended)
```bash
# Start the full environment (App + Caddy)
docker compose -f docker-compose.yml -f docker-compose.caddy.yml up -d --build
```

### Local Development
```bash
# Install dependencies
npm install

# Start the server
npm start
```

## Testing and Quality
- **Tests:** Functional API tests are located in `tests/` and use Jest and Supertest.
  ```bash
  npm test
  ```
- **Linting:** ESLint is configured for code quality.
  ```bash
  npm run lint
  ```

## Operations & Maintenance
- **DB Audit:** Check for inconsistencies between database and files.
  ```bash
  docker exec -it <container_id> node src/scripts/db-audit.js
  ```
- **DB Repair:** Correct broken links and normalize paths.
  ```bash
  docker exec -it <container_id> node src/scripts/db-repair.js
  ```
- **Prune Uploads:** Remove unreferenced files.
  ```bash
  docker exec -it <container_id> node src/scripts/uploads-prune.js
  ```

## Directory Structure
- `src/app.js`: Express application configuration and security middleware.
- `src/server.js`: Server entry point and database initialization.
- `src/db/sqlite.js`: Database schema, migrations, and connection helpers.
- `src/routes/`: API endpoint definitions.
- `src/schemas/`: Zod validation schemas.
- `src/public/`: Frontend assets and SPA code.
- `uploads/`: Physical storage for user-uploaded documents and photos.
- `tests/`: Automated test suite.
