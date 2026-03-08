# 📋 Gestor de Tareas sobre Plano

**Gestor de Tareas sobre Plano** es una aplicación web diseñada para la gestión de tareas ubicadas sobre un plano técnico o imagen local. Permite notificar problemas o tareas pendientes mediante posicionamiento sobre el plano, fotografías y descripciones detalladas.

---

## 🚀 Características Principales

- **Mapa/Plano Interactivo:** Visualización de tareas sobre una imagen local mediante Leaflet.
- **Autenticación:** Login, registro y sesión con JWT. Sin API_KEY/JWT configurados, la app muestra login al arrancar.
- **Usuarios y Asignación:** Gestión de usuarios y asignación de tareas al crear o editar.
- **Prioridad Editable:** Prioridad configurable en cada tarea.
- **Comentarios y Respuestas:** Hilos de comentarios en las tareas con notificaciones en tiempo real.
- **Centro de Notificaciones:** Notificaciones de comentarios y respuestas en tareas asignadas o propias.
- **Gestión Documental Dual:** Soporte independiente para **Imágenes** (evidencias gráficas) y **Documentos** (PDF, TXT, Markdown).
- **Visor Integrado:** Previsualización de documentos y renderizado rico de **Markdown** sin salir de la aplicación.
- **Categorías Dinámicas:** Los desplegables se alimentan automáticamente de las categorías existentes en la base de datos.
- **Posicionamiento Simple:** Ubicación manual intuitiva mediante clic sobre el plano.
- **Gestión Completa:** Ciclo de vida de tareas (Abierta 🟦, En proceso 🟧, Resuelta 🟩).
- **Modo Edición Avanzado:** Posibilidad de sustituir archivos originales y añadir pruebas de resolución por separado.
- **Privacidad Local:** Sistema de favoritos y "Mis tareas" persistido en el navegador (localStorage).
- **Entorno Seguro:** HTTPS local automático (Caddy), protección CSRF y Rate Limiting.

---

## 🛠️ Stack Tecnológico

- **Backend:** Node.js + Express
- **Base de Datos:** SQLite (ligera y persistente)
- **Frontend:** Vanilla JS (ES6+), HTML5, CSS3 (Modern UI)
- **Mapas:** Leaflet.js + Plano local (L.imageOverlay)
- **Tiempo Real:** Socket.io (notificaciones y comentarios)
- **Autenticación:** JWT (jsonwebtoken) + bcryptjs
- **Email:** Nodemailer (notificaciones al admin)
- **Infraestructura:** Docker + Docker Compose
- **Proxy/Seguridad:** Caddy (con soporte TLS local)

---

## 🚦 Arranque Rápido (Docker)

La forma más sencilla de ejecutar el proyecto es mediante Docker, lo cual configura automáticamente el servidor y el proxy HTTPS.

```bash
# 1. Levantar el entorno completo (App + Caddy con SSL local)

docker compose -f docker-compose.yml -f docker-compose.caddy.yml --profile local-https up -d --build

# 2. Acceder a la aplicación
# URL Principal (HTTPS): https://localhost:8443
# URL Alternativa (HTTP): http://localhost:8080
```

> **Nota:** Para evitar avisos de seguridad en el navegador debido al certificado auto-firmado de Caddy, consulta la sección de [HTTPS Local](#https-en-local-caddy).

### Arranque sin Docker

```bash
# 1. Instalar dependencias
npm install

# 2. Crear .env (copiar desde .env.example)
cp .env.example .env
# Editar .env según necesidad (JWT_SECRET, ADMIN_PASSWORD, etc.)

# 3. Iniciar servidor
npm start
# Por defecto: http://localhost:3000
```

---

## ⚙️ Configuración y Variables de Entorno

Copia `.env.example` a `.env` y personaliza los valores. Los directorios `data/`, `uploads/` y `backups/` se crean automáticamente si no existen.

| Variable | Descripción | Valor por defecto |
| --- | --- | --- |
| `API_KEY` | Clave para autorizar creación/edición (Header: `x-api-key`). Si no existe, se usa JWT tras login. | (Requerido en producción si no hay JWT) |
| `JWT_SECRET` | Secreto para firmar tokens JWT. **Obligatorio en producción.** | `dev-secret-key-12345` |
| `ADMIN_PASSWORD` | Contraseña del usuario admin inicial (se crea al arrancar si no existe). | — |
| `ADMIN_EMAIL` | Email del admin para notificaciones de nuevas incidencias. | — |
| `DB_FILE` | Ruta del archivo SQLite. | `./data/data.db` |
| `UPLOAD_DIR` | Directorio de subidas. | `./uploads` |
| `BACKUP_DIR` | Directorio de backups (recomendado: externo al repo). | `/Volumes/ESSAGER/__Backups_Repositorios/gestor-tareas` |
| `BACKUP_RETENTION_DAYS` | Días a conservar backups; tras cada backup se purgan los más antiguos. | `1` |
| `CSRF_ENABLED` | Activa la protección contra CSRF (`1` para activar) | `0` (desactivado) |
| `RATE_LIMIT_ENABLED` | Activa el limitador de peticiones en la API (`1` para activar) | `0` |
| `RATE_LIMIT_WINDOW_MS` | Ventana del rate limit (ms). | `60000` |
| `RATE_LIMIT_MAX` | Máximo de peticiones por ventana. | `180` |
| `NODE_ENV` | Entorno de ejecución (`development` o `production`) | `production` |
| `LOG_LEVEL` | Nivel de log (`info`, `debug`, `warn`, `error`). | `info` |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Configuración de correo (Nodemailer) para notificaciones. | — |

---

## 🔧 Mantenimiento y Operaciones

El proyecto incluye herramientas avanzadas para asegurar la consistencia de los datos y el almacenamiento.

### Auditoría y Reparación

Ejecuta estos comandos dentro del contenedor de la aplicación:

```bash
# Auditoría: Comprobar inconsistencias BD vs Archivos
docker compose -f docker-compose.yml -f docker-compose.caddy.yml exec gestor-tareas node src/scripts/db-audit.js

# Reparación: Normalizar rutas y corregir enlaces rotos (Dry Run)
docker compose -f docker-compose.yml -f docker-compose.caddy.yml exec gestor-tareas node src/scripts/db-repair.js

# Aplicar Reparación (Cuidado!)
docker compose -f docker-compose.yml -f docker-compose.caddy.yml exec gestor-tareas sh -c "DRY_RUN=0 node src/scripts/db-repair.js"
```

### Backup y Recuperación

Los backups automáticos se ejecutan cada 24h (configurable con `BACKUP_INTERVAL_MS`). Retención: 1 día por defecto (`BACKUP_RETENTION_DAYS`); se purgan automáticamente los backups más antiguos tras cada ejecución.

```bash
# Backup manual
docker compose -f docker-compose.yml -f docker-compose.caddy.yml exec gestor-tareas npm run backup

# Listar backups disponibles
docker compose -f docker-compose.yml -f docker-compose.caddy.yml exec gestor-tareas npm run backup:restore

# Restaurar BD y uploads
docker compose -f docker-compose.yml -f docker-compose.caddy.yml exec gestor-tareas sh -c "RESTORE=1 BACKUP_DB=db-2026-03-02T12-00-00.sqlite BACKUP_UPLOADS=uploads-2026-03-02T12-00-00.tar.gz npm run backup:restore"

# Purgar backups antiguos (dry-run primero)
docker compose -f docker-compose.yml -f docker-compose.caddy.yml exec gestor-tareas npm run backup:prune
docker compose -f docker-compose.yml -f docker-compose.caddy.yml exec gestor-tareas sh -c "PRUNE=1 npm run backup:prune"

# Recuperación ante SQLITE_CORRUPT (detener app antes)
docker compose -f docker-compose.yml -f docker-compose.caddy.yml exec gestor-tareas npm run db:recover
```

**Importante:** Los backups se guardan en un directorio externo al repositorio (`/Volumes/ESSAGER/__Backups_Repositorios/gestor-tareas`) para mayor seguridad. Ver `docs/RECOVERY.md` para el runbook completo ante corrupción de BD.

### Limpieza de Archivos (Prune)

Elimina fotos que no están referenciadas en ninguna incidencia:

```bash
# Ver qué se borraría (Dry Run)
docker compose -f docker-compose.yml -f docker-compose.caddy.yml exec gestor-tareas node src/scripts/uploads-prune.js

# Ejecutar limpieza real
docker compose -f docker-compose.yml -f docker-compose.caddy.yml exec gestor-tareas sh -c "PRUNE=1 node src/scripts/uploads-prune.js"
```

---

## 🔒 Hardening y Seguridad

### Rate Limiting

Protege la API de abusos configurando:

- `RATE_LIMIT_WINDOW_MS=60000` (ventana de 1 min)
- `RATE_LIMIT_MAX=180` (máximo de peticiones por ventana)

### HTTPS en Local (Caddy)

Caddy genera una CA local automáticamente. Para confiar en ella:

1. **Extraer certificado:**

   ```bash
   docker compose -f docker-compose.yml -f docker-compose.caddy.yml exec caddy cat /data/caddy/pki/authorities/local/root.crt > caddy-local-root.crt
   ```

2. **Importar en el sistema (macOS):**

   ```bash
   sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain caddy-local-root.crt
   ```

---

## 📂 Estructura del Proyecto

```text
├── src/
│   ├── app.js          # Configuración Express y Seguridad
│   ├── server.js       # Punto de entrada del servidor
│   ├── config/         # Rutas y configuración (paths, DB, uploads, backups)
│   ├── db/             # Capa de persistencia (SQLite)
│   ├── middleware/     # Auth (JWT/API_KEY), logger
│   ├── routes/         # Endpoints API (auth, issues, maps, photos...)
│   ├── services/       # Servicios (mail, etc.)
│   ├── cron/           # Tareas programadas (backup, health)
│   ├── public/         # Frontend
│   │   ├── index.html  # Aplicación Single Page (SPA)
│   │   └── ui/         # Activos UI y Orquestador JS
│   │       └── modules/# Módulos ES6 (Api, Map, List, Auth, Notifications...)
│   └── scripts/        # Herramientas de mantenimiento
├── data/               # Base de datos SQLite (no versionado)
├── uploads/            # Archivos subidos y miniaturas (no versionado)
├── backups/            # Copias de seguridad (no versionado)
├── docs/               # Documentación (ej. RECOVERY.md)
└── tests/              # Tests funcionales de la API
```

---

## 📝 Licencia

Proyecto privado - Todos los derechos reservados.
