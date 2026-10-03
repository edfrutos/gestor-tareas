# AGENTS.md

Guía para agentes de IA (Claude Code, Cursor, Codex, Gemini…) que trabajen en este repositorio.
Complementa a `Readme.md` (uso) y `docs/` (manual técnico, operaciones, API). Si algo de aquí
contradice al código, manda el código: actualiza este fichero en el mismo cambio.

## Qué es

**Gestor de Tareas sobre Plano**: tareas (incidencias) situadas sobre planos o imágenes, con fotos,
documentos, comentarios, asignación y notificaciones.

| Parte | Tecnología | Dónde |
|---|---|---|
| Backend | Node.js (CommonJS) + Express 4 | `src/` |
| Base de datos | SQLite vía **`node:sqlite`** (incluido en Node, sin dependencias nativas) | `src/db/sqlite.js` |
| Web | JavaScript vanilla (módulos ES), Leaflet, sin build | `src/public/` |
| Tiempo real | Socket.io | `src/services/socket.service.js` |
| App macOS | SwiftUI (XcodeGen), canales Mac App Store/TestFlight y Developer ID | `clients/macos/` |

## Requisitos y comandos

- **Node ≥ 22.13** (`node:sqlite`). La imagen Docker usa **Node 24**. En Node 22 los tests muestran un
  `ExperimentalWarning: SQLite…` inofensivo.
- **Solo npm** (`package-lock.json`). Nunca `pnpm` ni `yarn`.

| Tarea | Comando |
|---|---|
| Instalar | `npm ci` |
| Arrancar | `npm start` (puerto 3000) · `node --watch src/server.js` |
| Tests | `npm test` (Jest + Supertest, `--forceExit`) |
| Lint | `npm run lint` — hay errores previos en el repo; no añadas nuevos: `npx eslint <ficheros tocados>` |
| Docker local | `docker compose up -d` → `https://localhost:3001` (certificados de `./certs`) + Mailpit en `http://localhost:8825` |

Tras cambios en el backend con Docker local, si no se reflejan: `docker compose restart gestor-tareas`.

## Arquitectura del backend

- `src/server.js` arranca (fija `umask 077` antes de cargar nada); `src/app.js` monta middlewares y rutas
  (`/v1/...`; `/api/...` como alias de compatibilidad).
- Rutas en `src/routes/`, validación con **Zod** (`src/schemas/`), configuración en `src/config/`.
- **Base de datos: usa siempre `src/db/sqlite.js`** (`openDb`, `migrate`, `closeDb`, `run`, `get`, `all`,
  `integrityCheck`); nunca `node:sqlite` directamente desde rutas o servicios.
  - Las migraciones son aditivas en `migrate()` (`CREATE TABLE IF NOT EXISTS` + `ALTER TABLE ADD COLUMN`
    tras comprobar `PRAGMA table_info`). Nunca borres ni renombres columnas.
  - `run` devuelve `{ changes, lastID }`; `get` devuelve `null` si no hay fila; `undefined` → NULL y
    booleanos → 1/0 (Node 22 los rechaza); errores con `code` `SQLITE_*`.
  - `busy_timeout` se aplica **antes** que `journal_mode` al abrir: no cambies ese orden (sin él, abrir la
    BD con otra conexión activa falla con *database is locked*).
  - `SQLITE_JOURNAL_MODE=DELETE` solo para Docker Desktop sobre un volumen externo; por defecto WAL.
- **Copias de seguridad**: `src/cron/backup.js`. `runBackup()` se resuelve cuando han terminado la copia de
  la BD (Backup API de SQLite, consistente en WAL) **y** el `.tar.gz` de uploads. Ojo: hacer `require` del
  módulo arranca su temporizador; en scripts usa `runBackup().then(() => process.exit(0))`.

## Seguridad: invariantes que no hay que romper

Cada punto tiene tests; si los tocas, mantén o amplía la cobertura.

- **Autenticación** (`src/middleware/auth.middleware.js`, `src/services/session.service.js`): el JWT se
  contrasta con la BD en cada petición (usuario existente, `users.token_version` igual que el `tv` del
  token, **rol leído de la BD**). Cambiar o restablecer la contraseña, o que un admin cambie contraseña o
  rol, revoca sesiones (`revokeUserSessions`). Quien cambia su propia contraseña recibe un token nuevo.
- **Secreto JWT** solo en `src/config/secrets.js` (`signToken` / `verifyToken`, HS256). En producción la
  app no arranca sin `JWT_SECRET` válido. No vuelvas a definir secretos en otros ficheros.
- **API key** (`x-api-key`): solo para scripts; equivale a admin. Nunca la expongas por un endpoint ni la
  guardes en la web.
- **Acceso sin credenciales en desarrollo**: solo con `DEV_AUTH_BYPASS=1` + `NODE_ENV=development` exacto +
  sin `API_KEY` (`src/config/devAuth.js`).
- **Autorización**: una tarea solo la ven admin, creador o asignado. Aplica la misma regla en todo lo que
  cuelga de una tarea (detalle, historial, comentarios, eventos de socket con `emitToUsers`).
- **Subidas** (`src/config/uploadTypes.js`): la extensión la decide el servidor a partir del MIME
  permitido, nunca `originalname`. `/uploads` se sirve con `nosniff`, CSP restrictiva y descarga forzada
  fuera de la lista blanca.
- **Contraseñas nuevas**: mínimo 8 (`src/schemas/password.schema.js`, en sincronía con la web y con
  `PasswordPolicy` en macOS). El login no valida longitud.
- **Errores**: `src/middleware/errorHandler.js` devuelve mensaje genérico en los 5xx (el detalle solo al log).
- **CORS** común a Express y Socket.io (`src/config/cors.js`, `ALLOWED_ORIGINS`); `TRUST_PROXY` (por
  defecto 1 salto) para la IP real tras el proxy; limitadores siempre activos en `/v1/auth`.
- **Correos** (`src/services/mail.service.js`): escapa todo dato de usuario con `escapeHtml`.
- **Tokens de reset**: en BD solo su SHA-256.
- **Contenedor**: usuario uid/gid **10001** (no lo cambies a un uid que pueda existir en el host) y
  ficheros privados (`600` / `700`).

## Tests

- Cada fichero de test configura su entorno **antes** de requerir la app (`DB_FILE`, `UPLOAD_DIR`,
  `JWT_SECRET`, `API_KEY`…) y usa un directorio temporal propio. Sigue ese patrón en tests nuevos.
- Algunos tests comparten `data/test.db` y Jest los ejecuta en paralelo.
- Para correcciones, añade un test que **falle con el código anterior** y compruébalo.
- El job `restore-test` del CI corre **sin `--forceExit`**: un callback asíncrono que escriba en el log
  después de acabar el test lo hace fallar.
- Si el repositorio está montado a la vez en un Mac y en un entorno Linux (contenedores, sandbox),
  `node_modules` es compartido: los binarios de `sharp` son de la plataforma que hizo el último `npm ci`.
  En la otra, sharp usa su reserva WebAssembly y alguna suite puede fallar de forma intermitente al
  arrancar. No reinstales `node_modules` sin avisar a quien use la otra plataforma.

## App macOS (`clients/macos/`)

- El `.xcodeproj` no se versiona: `make generate` (XcodeGen). `make test` compila y pasa los tests; el CI
  (`macos-client-ci.yml`) hace lo mismo en cada PR que toque `clients/macos/`.
- Despliegue mínimo macOS 14. Usa solo APIs disponibles en 14.
- **Número de build** (`CURRENT_PROJECT_VERSION` en `Config/Base.xcconfig`): súbelo en cada versión
  publicada. Es común a TestFlight/App Store y Developer ID, y App Store Connect no admite repetirlo.
- App Store/TestFlight: `make archive-mas` guarda el archive directamente en el Organizer de Xcode
  (no lo abras con `open`, que lo duplica); se sube desde el Organizer (la exportación MAS por línea de
  comandos falla con firma manual).
- Developer ID: `make archive-devid` + `./scripts/notarize.sh` → `build/GestorTareas.dmg`, publicado como
  release de GitHub `macos-v<versión>-<build>`. La app busca actualizaciones en esas releases.
- Antes de publicar un `.dmg`, comprueba `CFBundleVersion` en
  `build/export-devid/GestorTareas.app/Contents/Info.plist`.

## Convenciones

- Código, comentarios, mensajes de commit y textos de la interfaz **en español**.
- Commits estilo *conventional commits* (`fix(auth): …`, `feat(macos): …`, `chore(deps): …`), con el
  porqué en el cuerpo. Cambios por PR contra `main`.
- El hook de pre-commit (Husky) ejecuta `npm test`; no lo saltes (`--no-verify`).
- **Repositorio público**: nunca subas secretos, `.env`, bases de datos, uploads ni copias. Al corregir
  vulnerabilidades, describe el cambio sin detallar cómo explotarlas.
- **Producción**: al fusionar en `main`, el CI (`docker-build-push.yml`) publica la imagen en Docker Hub
  (amd64 y arm64). El despliegue en el servidor lo hace a mano quien lo gestiona y no está documentado en
  el repositorio (`docs/GUIA_OPERACIONES.md` cubre el entorno local y el mantenimiento): no reconstruyas
  ni ejecutes comandos de despliegue por tu cuenta; pide la configuración real. Cualquier cambio que
  afecte a variables de entorno, volúmenes, permisos o uid del contenedor debe indicar en el PR los pasos
  necesarios en el servidor y cómo volver atrás.
