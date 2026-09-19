# Contrato de API — Gestor de Tareas

> Especificación del backend que consume el **cliente macOS (SwiftUI)** y la SPA web.
> Fuente de verdad: `src/routes/*.js`, `src/schemas/issue.schema.js`, `src/middleware/auth.middleware.js`, `src/services/socket.service.js`.
> Última revisión: 2026-09-08 (backend `0.2.0`).

---

## 1. Base

| | Valor |
| --- | --- |
| Prefijo canónico | `/v1` (alias legacy `/api` para `auth`, `issues`, `photos`) |
| Formato | JSON (`Content-Type: application/json`), salvo subida de ficheros (`multipart/form-data`) |
| Límite body JSON | `1mb` |
| TLS | El servidor arranca en HTTPS si `SSL_CERT_PATH` + `SSL_KEY_PATH` están definidos; si no, HTTP |
| Puertos | Local sin Docker: `3000`. Docker directo: host `3001` → `3000`. Tras Caddy: `8443` (HTTPS) / `8080` (HTTP) |
| CORS | No aplica a un cliente nativo (sin `Origin`). Para navegador: allowlist por `CORS_ORIGINS`, o cualquier origen local en no-producción |

### Health check

```
GET /health   → 200 { ... }   (sin auth; usar para el indicador de conexión de la app)
```

### Config pública (sin auth)

```
GET /v1/config → 200 { "publicApiIdentifier": string|null, "csrfEnabled": boolean }
```

---

## 2. Autenticación

### Esquema

- **JWT Bearer** en cabecera: `Authorization: Bearer <token>`.
- Payload del token: `{ id, username, email, role }`. **Expira a las 24 h. No hay endpoint de refresh** → ver [§6 Brechas](#6-brechas-del-backend-para-el-cliente-macos).
- `role` ∈ `"admin" | "user"`. Los endpoints marcados **[admin]** exigen `role === "admin"` (si no, `403`).
- Retrocompatibilidad: `x-api-key: <API_KEY>` equivale a un admin (`id:1`). El cliente macOS **no** debe usar esto.
- En `NODE_ENV` distinto de `production`/`test` y sin `API_KEY`, el backend deja pasar sin token como admin. El cliente debe enviar siempre el token igualmente.

### Endpoints

| Método | Ruta | Auth | Cuerpo | Respuesta |
| --- | --- | --- | --- | --- |
| POST | `/v1/auth/login` | — | `{ username, password }` (`username` acepta email, case-insensitive) | `200 { token, user:{id,username,email,role,avatar_url,avatar_thumb_url} }` · `401 { error: "Usuario o contraseña incorrectos" }` |
| POST | `/v1/auth/register` | — | `{ username, email?, password }` (siempre crea `role: "user"`; no acepta `role` del cliente) | `201 { id, username, email, role }` · `400 { error }` |
| POST | `/v1/auth/forgot-password` | — | `{ email }` | `200` (siempre, no revela existencia). Email vía SMTP/Mailpit |
| POST | `/v1/auth/reset-password` | — | `{ token, password }` | `200` · `400` token inválido/expirado (1 h) |
| GET | `/v1/auth/me` | Bearer | — | `200 { id, username, email, role, avatar_url, avatar_thumb_url }` |
| PATCH | `/v1/auth/me` | Bearer | `{ email?, password?, currentPassword? }` (`currentPassword` solo obligatorio si se cambia `password`) | `200 { user }` · `404` si la cuenta ya no existe → la app debe cerrar sesión |
| PATCH | `/v1/auth/me/password` | Bearer | `{ currentPassword, newPassword }` | `200` · `400/401` |
| GET | `/v1/auth/me/apikey` | Bearer | — | `200 { apiKey }` (uso avanzado; no necesario en la app) |
| POST | `/v1/auth/me/avatar` | Bearer | `multipart/form-data`, campo `avatar` (imagen, mismos límites/tipos que las fotos de tareas: jpg/png/webp/gif, `MAX_UPLOAD_BYTES`) | `200 { avatar_url, avatar_thumb_url }` · `400` tipo/tamaño inválido. Reemplaza y borra el avatar anterior si había. |
| DELETE | `/v1/auth/me/avatar` | Bearer | — | `200 { ok: true }`. Pone `avatar_url`/`avatar_thumb_url` a `null` y borra los ficheros. |
| DELETE | `/v1/auth/me` | Bearer | `{ password }` | `200 { ok: true }` · `400/403`. Borrado de cuenta self-service (Apple Guideline 5.1.1(v)); reasigna planos/zonas propios a otro admin antes de borrar. |

---

## 3. Recursos

### 3.1 Issues (tareas)

Modelo (campos devueltos en listado y detalle):

```
id, title, category, description,
lat, lng,                                  // coordenadas sobre el plano (píxeles/técnicas, sin rango GPS)
photo_url, thumb_url, text_url,            // evidencia original (imagen / miniatura / documento)
resolution_photo_url, resolution_thumb_url, resolution_text_url,   // prueba de resolución
status,                                    // "open" | "in_progress" | "resolved"
priority,                                  // "low" | "medium" | "high" | "critical"
due_date,                                  // "YYYY-MM-DD" | null
created_at,                                // ISO 8601
created_by, created_by_username,
map_id,
assigned_to, assigned_to_username
```

Las `*_url` son rutas relativas servidas por el backend (`/uploads/...`). El cliente las resuelve contra la base del servidor.

| Método | Ruta | Auth | Notas |
| --- | --- | --- | --- |
| GET | `/v1/issues` | Bearer | Query params abajo. Respuesta paginada `{ items:[...], page, pageSize, total }`. RBAC: `user` solo ve las creadas por él o asignadas a él; `admin` ve todas |
| GET | `/v1/issues/:id` | Bearer | Detalle completo |
| POST | `/v1/issues` | Bearer | `multipart/form-data`. Campos: `title, category, description, lat, lng` (obligatorios), `map_id?` (def. 1), `assigned_to?`, `priority?` (def. `medium`), `due_date?`. Ficheros opcionales: `photo` (imagen), `file` (documento). `201` con el issue creado. Emite `issue:created` |
| PATCH | `/v1/issues/:id` | Bearer | `multipart/form-data`. Campos opcionales: `status, description, category, map_id, assigned_to, priority, due_date`. Ficheros: `photo`, `file`, y variantes de resolución. Emite `issue:updated` |
| DELETE | `/v1/issues/:id` | Bearer | `admin` o autor. Emite `issue:deleted` `{ id }` |
| GET | `/v1/issues/:id/logs` | Bearer | Historial de auditoría: `[{ id, action, old_value, new_value, user_id, created_at }]`. `action` ∈ `create, update_status, assign, update_priority, update_due_date, update_category, update_map, ...` |
| GET | `/v1/issues/stats` | Bearer | Contadores para badges: por estado, etc. |
| GET | `/v1/issues/stats/details` | Bearer | Series para gráficas (por categoría, por usuario si admin) |
| GET | `/v1/issues/categories` | Bearer | `[string]` — categorías existentes (alimenta los desplegables) |
| GET | `/v1/issues/export` | Bearer | CSV (`Content-Type: text/csv`) con los filtros aplicados |

**Query params de `GET /v1/issues`** (`src/schemas/issue.schema.js::getIssuesSchema`):

```
page=1                 pageSize=10 (máx 100)
status=open|in_progress|resolved
category=<string>       q=<texto libre: título, descripción, autor>
order=new|old|cat|status|priority|due_date   (def. new)
from=YYYY-MM-DD          to=YYYY-MM-DD
mapId=<int>              assigned_to=<int>
only_assigned_to_me=true|false
only_created_by_me=true|false
```

### 3.2 Comentarios (hilos)

Montado en `/v1/issues/:id/comments`.

| Método | Ruta | Auth | Notas |
| --- | --- | --- | --- |
| GET | `/v1/issues/:id/comments` | — (público) | Devuelve **árbol** anidado: `[{ id, user_id, username, text, parent_id, created_at, replies:[...] }]` |
| POST | `/v1/issues/:id/comments` | Bearer | `{ text, parent_id? }`. Dispara email al autor y al asignado de la tarea (si tienen email) |

### 3.3 Maps (planos) y Zones

| Método | Ruta | Auth | Notas |
| --- | --- | --- | --- |
| GET | `/v1/maps` | Bearer | `[{ id, name, filename, file_url, created_by, created_by_username, parent_id, archived, created_at }]`. Query: `include_archived=true`, `parent_id=<int>`, `exclude_layers=true`. RBAC: `user` ve los suyos + los del admin (id 1) |
| GET | `/v1/maps/:id` | Bearer | Detalle + `layers:[...]` (capas técnicas hijas, `parent_id = :id`) |
| POST | `/v1/maps` | Bearer | `multipart/form-data`, campo fichero `map` (imagen), `name`, `parent_id?` |
| PATCH | `/v1/maps/:id/archive` | Bearer | `{ archived: 0|1 }` |
| DELETE | `/v1/maps/:id` | Bearer | Autor o admin. Borrado en cascada de capas |
| GET | `/v1/maps/:mapId/zones` | Bearer | `[{ id, name, color, geojson, created_by, created_at }]` |
| POST | `/v1/maps/:mapId/zones` | Bearer | `{ name, color, geojson }` (GeoJSON polígono/rectángulo) |
| PATCH | `/v1/maps/:mapId/zones/:id` | Bearer | Solo autor o admin |
| DELETE | `/v1/maps/:mapId/zones/:id` | Bearer | Solo autor o admin |

### 3.4 Usuarios

| Método | Ruta | Auth | Notas |
| --- | --- | --- | --- |
| GET | `/v1/users/for-assign` | Bearer | `[{ id, username }]` — lista mínima para el selector de asignación (cualquier usuario) |
| GET | `/v1/users` | Bearer **[admin]** | Paginado `{ items:[{id,username,email,role,created_at}], page, ... }` (`?page=&pageSize=`) |
| POST | `/v1/users` | Bearer **[admin]** | `{ username, email?, password, role }` |
| PATCH | `/v1/users/:id` | Bearer **[admin]** | `{ role?, password? }` |
| DELETE | `/v1/users/:id` | Bearer **[admin]** | No puede borrarse a sí mismo |

### 3.5 Notificaciones

| Método | Ruta | Auth | Notas |
| --- | --- | --- | --- |
| GET | `/v1/notifications` | Bearer | `{ items: [...] }` (máx 50), combinación ordenada por fecha de: `{type:"comment"|"reply", issue_id, issue_title, commenter_username, text_preview, created_at}` y `{type:"log", action, old_value, new_value, issue_id, issue_title, created_at}` |

### 3.6 Settings (configuración en caliente)

| Método | Ruta | Auth | Notas |
| --- | --- | --- | --- |
| GET | `/v1/settings` | Bearer **[admin]** | `{ MAX_UPLOAD_BYTES, ADMIN_EMAIL, PUBLIC_URL, RATE_LIMIT_ENABLED, RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX, ... }` |
| PATCH | `/v1/settings` | Bearer **[admin]** | Objeto parcial. Actualización atómica. Emite `settings:updated` |

### 3.7 Photos / ficheros sueltos

| Método | Ruta | Auth | Notas |
| --- | --- | --- | --- |
| POST | `/v1/photos` | Bearer | `multipart/form-data`, campo `file`. Devuelve `{ url, thumbUrl? }` |
| GET | `/uploads/<archivo>` | — | Estáticos (imágenes, miniaturas, documentos). `Cache-Control` largo |

---

## 4. Tiempo real (Socket.io)

- Cliente: **Socket.io v4** (protocolo EIO4). En Swift: [`socket.io-client-swift`](https://github.com/socketio/socket.io-client-swift).
- URL: la misma base del servidor (`wss://host:puerto`). CORS del socket: `origin: "*"`.
- **No hay autenticación en el handshake del socket** hoy — todos los eventos se emiten a todos los clientes conectados (`io.emit`). Ver [§6](#6-brechas-del-backend-para-el-cliente-macos).

| Evento | Payload | Uso en la app |
| --- | --- | --- |
| `issue:created` | issue completo | Insertar en lista/mapa; toast |
| `issue:updated` | issue completo | Refrescar fila/detalle/marcador |
| `issue:deleted` | `{ id }` | Eliminar de lista/mapa |
| `settings:updated` | objeto settings | Refrescar panel admin |

No se emiten eventos de comentarios ni de notificaciones (la app debe re-consultar `/v1/issues/:id/comments` y `/v1/notifications`, o hacer polling ligero como la SPA — 30 s).

---

## 5. Errores

Formato **no uniforme** (a normalizar). El cliente debe decodificar de forma tolerante:

```jsonc
// forma A (middleware de error y auth)
{ "error": { "code": "unauthorized", "message": "...", "requestId": "..." } }
// forma B (validación Zod y varios handlers de auth)
{ "error": "Usuario o contraseña incorrectos" }
{ "error": [ { "path": ["title"], "message": "Title is required" } ] }
```

Códigos HTTP relevantes: `400` validación · `401` sin/mal token · `403` rol insuficiente o no es el propietario · `404` no existe · `409` conflicto · `413` fichero demasiado grande · `429` rate limit.

Rate limiting (si `RATE_LIMIT_ENABLED=1`): ventana `RATE_LIMIT_WINDOW_MS` (def. 60 000 ms), máx `RATE_LIMIT_MAX` (def. 180) por `/v1` y `/api`.

---

## 6. Brechas del backend para el cliente macOS

Trabajo en el servidor que conviene abordar en paralelo al cliente (no bloquea el arranque, sí la calidad):

1. **Refresh token / sesión larga.** JWT de 24 h sin refresh → la app tendría que re-pedir credenciales a diario. Opciones: endpoint `POST /v1/auth/refresh`, o `expiresIn` configurable + refresh silencioso.
2. **Auth en el handshake de Socket.io.** Hoy cualquiera que alcance el puerto recibe todos los eventos. Añadir `io.use()` que valide el JWT de `socket.handshake.auth.token` y, idealmente, segmentar por salas (`user:<id>`, `map:<id>`).
3. **Formato de error unificado** (`{ error: { code, message } }` siempre). Simplifica el decoder Swift y el mapeo a mensajes de UI.
4. **Endpoint de versión/compatibilidad** (`GET /v1/version → { api, minClient }`) para que la app avise si necesita actualizarse.
5. **Eventos realtime de comentarios/notificaciones** (`comment:created`, `notification:new`) para evitar polling desde la app.
6. **Paginación consistente** — confirmar que todos los listados devuelven `{ items, page, pageSize, total }` (issues y users sí; maps devuelve array plano).
7. **CORS**: no afecta al cliente nativo, pero si la app embebe algún `WKWebView` puntual apuntando a `/uploads`, revisar `helmet`/CSP.
