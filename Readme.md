# 📋 Gestor de Tareas sobre Plano

**Gestor de Tareas sobre Plano** es una aplicación web diseñada para la gestión de tareas ubicadas sobre un plano técnico o imagen local. Permite notificar problemas o tareas pendientes mediante posicionamiento sobre el plano, fotografías y descripciones detalladas.

---

## 🚀 Características Principales

- **Mapa/Plano Interactivo:** Visualización de tareas sobre una imagen local mediante Leaflet.
- **Posicionamiento Simple:** Ubicación manual intuitiva mediante clic sobre el plano.
- **Gestión Completa:** Ciclo de vida de incidencias (Abierta 🟦, En proceso 🟧, Resuelta 🟩).
- **Dashboard Dual:** Interfaz dividida con herramientas de creación arriba y listado expandido abajo.
- **Modo Edición:** Posibilidad de actualizar descripciones y añadir fotos de resolución una vez solucionado el problema.
- **Privacidad Local:** Sistema de favoritos y "Mis incidencias" persistido en el navegador (localStorage).
- **Entorno Seguro:** HTTPS local automático, protección CSRF, Rate Limiting y políticas CSP.

---

## 🛠️ Stack Tecnológico

- **Backend:** Node.js + Express
- **Base de Datos:** SQLite (ligera y persistente)
- **Frontend:** Vanilla JS (ES6+), HTML5, CSS3 (Modern UI)
- **Mapas:** Leaflet.js + Plano local (L.imageOverlay)
- **Infraestructura:** Docker + Docker Compose
- **Proxy/Seguridad:** Caddy (con soporte TLS local)

---

## 🚦 Arranque Rápido (Docker)

La forma más sencilla de ejecutar el proyecto es mediante Docker, lo cual configura automáticamente el servidor y el proxy HTTPS.

```bash
# 1. Levantar el entorno completo (App + Caddy)
docker compose -f docker-compose.yml -f docker-compose.caddy.yml up -d --build

# 2. Acceder a la aplicación
# URL Principal (HTTPS): https://localhost:8443
# URL Alternativa (HTTP): http://localhost:8080
```

> **Nota:** Para evitar avisos de seguridad en el navegador debido al certificado auto-firmado de Caddy, consulta la sección de [HTTPS Local](#https-en-local-caddy).

---

## ⚙️ Configuración y Variables de Entorno

Crea un archivo `.env` en la raíz del proyecto para personalizar el comportamiento:

| Variable | Descripción | Valor por defecto |
| --- | --- | --- |
| `API_KEY` | Clave para autorizar creación/edición (Header: `x-api-key`) | (Requerido) |
| `CSRF_ENABLED` | Activa la protección contra CSRF | `1` |
| `RATE_LIMIT_ENABLED` | Activa el limitador de peticiones en la API | `0` |
| `NODE_ENV` | Entorno de ejecución (`development` o `production`) | `production` |

---

## 🔧 Mantenimiento y Operaciones

El proyecto incluye herramientas avanzadas para asegurar la consistencia de los datos y el almacenamiento.

### Auditoría y Reparación
Ejecuta estos comandos dentro del contenedor de la aplicación:

```bash
# Auditoría: Comprobar inconsistencias BD vs Archivos
docker exec -it cola-ciudadana-cola-ciudadana-1 node src/scripts/db-audit.js

# Reparación: Normalizar rutas y corregir enlaces rotos (Dry Run)
docker exec -it cola-ciudadana-cola-ciudadana-1 node src/scripts/db-repair.js

# Aplicar Reparación (Cuidado!)
docker exec -it cola-ciudadana-cola-ciudadana-1 sh -c "DRY_RUN=0 node src/scripts/db-repair.js"
```

### Limpieza de Archivos (Prune)
Elimina fotos que no están referenciadas en ninguna incidencia:

```bash
# Ver qué se borraría (Dry Run)
docker exec -it cola-ciudadana-cola-ciudadana-1 node src/scripts/uploads-prune.js

# Ejecutar limpieza real
docker exec -it cola-ciudadana-cola-ciudadana-1 sh -c "PRUNE=1 node src/scripts/uploads-prune.js"
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
   docker compose exec caddy cat /data/caddy/pki/authorities/local/root.crt > caddy-local-root.crt
   ```
2. **Importar en el sistema (macOS):**
   ```bash
   sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain caddy-local-root.crt
   ```

---

## 📂 Estructura del Proyecto

```text
├── src/
│   ├── app.js          # Lógica principal Express
│   ├── server.js       # Punto de entrada
│   ├── db/             # Capa de persistencia (SQLite)
│   ├── middleware/     # Seguridad, Logger, Rate-Limit
│   ├── public/         # Frontend (HTML, CSS, UI JS)
│   ├── routes/         # Definición de Endpoints API
│   └── scripts/        # Herramientas de mantenimiento
├── docs/               # Manuales detallados (ignorados por Git)
├── uploads/            # Almacenamiento de imágenes (fotos/thumbs)
└── tests/              # Tests funcionales de la API
```

---

## 📝 Licencia
Proyecto privado - Todos los derechos reservados.