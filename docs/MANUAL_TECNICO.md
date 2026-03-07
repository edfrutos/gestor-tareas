# Manual Técnico - Cola Ciudadana

## Descripción del Proyecto
Cola Ciudadana es una aplicación web para reportar incidencias ciudadanas con geolocalización, mapa interactivo y gestión de estados.

### Características Principales
*   **Mapa Interactivo:** Leaflet + MarkerCluster para visualizar incidencias.
*   **Geolocalización:** Detección automática "Mi ubicación" con fallback manual.
*   **Gestión de Incidencias:** Alta con fotos, categorías, descripción y coordenadas.
*   **Moderación:** Cambio de estados (Abierta, En curso, Resuelta), borrado y favoritos locales.
*   **Seguridad:** Rate limiting, CSRF protection, CSP headers.

## Arquitectura

### Backend (Node.js + Express)
*   **Entrada:** `src/server.js`.
*   **Base de Datos:** SQLite (`src/db/`).
*   **Almacenamiento:** Sistema de archivos local (`src/uploads/`) con procesamiento de imágenes vía `sharp` y `multer`.
*   **Middleware:** Seguridad (`helmet`, `rate-limit`, `csrf`), Logging (`pino`).

### Frontend (Vanilla JS)
*   **Estructura:** HTML/CSS estático servido por Express (`src/public`).
*   **Lógica:** `src/public/ui/app.js` (sin bundlers complejos).
*   **Librerías:** Leaflet (Mapas).

### Infraestructura (Docker)
*   **Contenedor App:** Node.js.
*   **Contenedor Web/Proxy:** Caddy (HTTPS local, certificados automáticos).
*   **Orquestación:** Docker Compose.

## Hardening y Seguridad

### Rate Limiting (API)
Implementado en memoria para proteger endpoints `/v1` y `/api`.
Configurable vía variables de entorno:
*   `RATE_LIMIT_ENABLED=1`
*   `RATE_LIMIT_WINDOW_MS=60000` (1 minuto)
*   `RATE_LIMIT_MAX=180` (peticiones)

### Cache de Imágenes
En producción, las imágenes en `/uploads` se sirven con:
`Cache-Control: public, max-age=2592000, immutable`

### Content Security Policy (CSP)
Configurado vía Helmet para permitir:
*   Mapas: OpenStreetMap tiles.
*   Scripts/Estilos: `unpkg.com` (Leaflet).
*   Imágenes: `self`, `data:`, `openstreetmap`.
