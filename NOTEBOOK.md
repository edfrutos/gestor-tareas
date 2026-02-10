# Notebook de Seguimiento - Gestor de Tareas

**Fecha:** 10 de Febrero de 2026
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
*   **Arquitectura de Módulos ES6:** Se dividió `app.js` en 9 módulos especializados (`api`, `store`, `map`, `list`, `details`, etc.).
*   **Optimización de Carga:** Se actualizó `index.html` para usar `<script type="module">`.
*   **Resolución de Conflictos TDZ:** Se corrigieron problemas de dependencias circulares.

### Fase 5: Mantenimiento y Calidad
*   **Limpieza de Archivos Huérfanos:** Implementada lógica para borrar adjuntos físicos al borrar/actualizar tareas.
*   **Validación de Esquema (Zod):** Migración completa a Zod para validación de datos en backend.
*   **Corrección de Bugs Silenciosos:** Reparado endpoint `/health` y tests unitarios.

### Fase 6: Funcionalidades Avanzadas de Usuario
*   **Exportación CSV:** Endpoint y botón para descargar informes filtrados.
*   **Búsqueda por Fecha:** Filtros `from` y `to` implementados y corregidos.

### Fase 7: Auditoría y Experiencia de Usuario (10 Feb 2026)
*   **Historial de Cambios (Audit Log):**
    *   **Base de Datos:** Tabla `issue_logs` creada.
    *   **Backend:** Logging automático de acciones (`create`, `update`, etc.).
    *   **Frontend:** Visualización del historial integrada en el modal de detalle con iconos y formato amigable.
*   **Notificaciones Visuales (Polling):**
    *   **UI:** Badges de colores (Azul/Naranja/Verde) en el encabezado mostrando tareas Abiertas/En Proceso/Resueltas en tiempo real (Polling 30s).
*   **Infraestructura y DevOps:**
    *   **Backups:** Script diario (`src/cron/backup.js`) para respaldar DB y adjuntos.
    *   **CI/CD:** Flujo de GitHub Actions (`.github/workflows/ci.yml`) configurado para ejecutar tests en cada push.

---

## 3. Estado Actual
La aplicación es funcional, estable y presenta un código limpio y profesional:
*   **Gestión Documental:** Separación clara entre imágenes y documentos de texto.
*   **Visualización Avanzada:** Renderizado rico de Markdown y visor de documentos integrado.
*   **Backend Robusto:** Logs detallados, validaciones regionales y resiliencia ante fallos.
*   **Seguridad y Calidad:** Validaciones estrictas con Zod y tests unitarios funcionales.
*   **Auditoría Completa:** Traza de cambios visible para el usuario.
*   **UX Reactiva:** Contadores de estado en tiempo real.
*   **Automatización:** Backups diarios y CI/CD configurados.

---

## 4. Sugerencias y Próximos Pasos

### 🛠️ Técnicas
1.  **Optimización de Imágenes:** Implementar compresión más agresiva (WebP con menor calidad) para miniaturas en móviles si el tráfico aumenta.
2.  **Rate Limiting por IP:** Ajustar los límites de peticiones en `src/middleware/rateLimit.js` si se despliega públicamente para evitar abuso.

### ✨ Funcionales
1.  **Autenticación Real:** Actualmente se usa una API Key compartida. Implementar usuarios reales (Login/Registro) para mejorar la auditoría (`user_id`).
2.  **Comentarios:** Permitir añadir notas de texto a una tarea sin cambiar su estado.
3.  **Geolocalización Inversa:** Mostrar la dirección postal aproximada (calle, número) obtenida de las coordenadas al crear una tarea.
