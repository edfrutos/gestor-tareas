# Notebook de Seguimiento - Gestor de Tareas

**Fecha:** 7 de Febrero de 2026
**Contexto:** Intervención técnica sobre repositorio `gestor-tareas`.

## 1. Estado Inicial
Al tomar el proyecto, la aplicación presentaba una arquitectura funcional basada en Node.js (Express), SQLite y Docker (con Caddy como proxy), pero sufría de varios problemas críticos de estabilidad y funcionalidad reportados:

*   **Bloqueo Crítico:** No se podían crear tareas con archivos adjuntos. El servidor fallaba silenciosamente o rechazaba la petición.
*   **Problemas de Despliegue:** El contenedor no exponía correctamente los puertos o no era accesible (`localhost:3000` y `:8443` inaccesibles).
*   **Inconsistencia de Red:** Los servicios (backend y proxy) corrían en redes Docker separadas, impidiendo la comunicación interna (Error 502).
*   **Problemas de Caché:** Los cambios en el Frontend no se reflejaban debido a políticas de caché agresivas en el servidor.
*   **Limitación Funcional:** No existía distinción entre imágenes y documentos de texto; todo se trataba como "foto", causando errores de visualización y validación.

---

## 2. Bitácora de Soluciones y Mejoras

### Fase 1: Estabilización de Infraestructura y Backend
*   **Corrección de Redes Docker:** Se unificó el despliegue bajo un único comando `docker compose` para garantizar que `cola-ciudadana` (backend) y `caddy` (proxy) compartan la red `gestor-tareas_default`.
*   **Mapeo de Puertos:** Se corrigió la exposición del puerto `3000` en el contenedor del backend para permitir acceso directo y depuración.
*   **Robustez en Base de Datos (`src/db/sqlite.js`):**
    *   Se implementaron manejadores de errores (`db.on('error')`) para evitar que el servidor "muera" silenciosamente ante problemas de conexión.
    *   Se añadió logging detallado en las operaciones SQL.
*   **Validación de Coordenadas (`issues.routes.js`):** Se modificó la función `toNum` para aceptar coordenadas con **coma decimal** (formato regional español `40,416`), evitando errores `400 Bad Request` al crear tareas.
*   **Entorno Local:** Se solucionaron incompatibilidades de arquitectura (`x64` vs `arm64`) en dependencias nativas (`sharp`, `sqlite3`) reinstalando `node_modules` correctamente.

### Fase 2: Correcciones del Frontend
*   **Caché (Cache-Busting):**
    *   Se configuró el servidor (`src/app.js`) para enviar cabeceras `Cache-Control: no-cache` en archivos críticos de UI (`index.html`, `app.js`).
    *   Se añadió versionado (`?v=3`) en la carga del script principal.
*   **Recuperación del Mapa:** Se corrigió la ruta relativa del plano (`ui/plano.jpg` → `/ui/plano.jpg`) que impedía su carga en ciertas rutas.
*   **Corrección de Sintaxis:** Se reparó un error de sintaxis en `app.js` (cierre de función `wireUi`) que bloqueaba la ejecución total del Javascript.

### Fase 4: Refactorización y Modularización (Frontend)
Para mejorar la mantenibilidad y escalabilidad, se transformó el frontend monolítico en una arquitectura modular moderna:

*   **Arquitectura de Módulos ES6:** Se dividió `app.js` (~2000 líneas) en 9 módulos especializados dentro de `src/public/ui/modules/`:
    *   `config.js`: Constantes y configuración centralizada.
    *   `store.js`: Gestión del estado global y persistencia local (Favs/Mine).
    *   `utils.js`: Funciones auxiliares de UI, formateo y decoradores (`withBusy`).
    *   `api.js`: Lógica de comunicación con el backend y gestión CSRF.
    *   `map.js`: Abstracción completa de la lógica de Leaflet y marcadores.
    *   `list.js`: Motor de renderizado del listado de tareas y filtros.
    *   `details.js`: Gestión compleja del modal de detalle, visualización de evidencias y modo edición.
    *   `modals.js`: Controladores para los visores de fotos y documentos.
    *   `forms.js`: Lógica de los formularios de creación y configuración.
*   **Optimización de Carga:** Se actualizó `index.html` para usar `<script type="module">`, permitiendo al navegador gestionar las dependencias de forma nativa.
*   **Resolución de Conflictos TDZ:** Se corrigieron problemas de dependencias circulares mediante el uso de declaraciones de funciones hoisted.

---

## 3. Estado Actual
La aplicación es funcional, estable y presenta un código limpio y profesional:
*   **Gestión Documental:** Separación clara entre imágenes y documentos de texto en todo el stack.
*   **Visualización Avanzada:** Renderizado rico de Markdown y visor de documentos integrado.
*   **Backend Robusto:** Logs detallados, validaciones regionales y resiliencia ante fallos de conexión a DB.
*   **Frontend Mantenible:** Estructura modular que permite añadir funcionalidades sin aumentar la complejidad técnica.

---

## 4. Sugerencias y Próximos Pasos

### 🛠️ Técnicas
1.  **Limpieza de Archivos Huérfanos:** Implementar lógica en el backend para borrar archivos físicos del disco cuando se sustituyen mediante `PATCH`.
2.  **Validación de Esquema:** Migrar a una librería de validación como `Zod` o `Joi` en el backend para manejar la complejidad creciente de los campos de archivos.
3.  **Unit Testing:** Restaurar y ampliar los tests (`supertest` / `jest`) para cubrir la nueva lógica de múltiples archivos.

### ✨ Funcionales
1.  **Exportación de Informes:** Botón para generar un PDF o CSV consolidado de las tareas filtradas.
2.  **Búsqueda por Fecha:** Añadir un selector de rango de fechas en la barra de filtros.
3.  **Historial de Cambios:** Guardar un log de quién y cuándo cambió el estado de una tarea (requeriría tabla de logs).
4.  **Notificaciones Visuales:** Implementar un sistema de "badge" o contador de tareas abiertas en tiempo real (vía Polling o WebSockets).
