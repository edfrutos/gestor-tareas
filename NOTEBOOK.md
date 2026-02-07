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

### Fase 3: Nueva Funcionalidad - Distinción de Archivos
Se implementó una separación lógica y visual completa entre **Imágenes** y **Documentos**:

#### Base de Datos
*   Añadidas columnas: `text_url`, `resolution_photo_url`, `resolution_thumb_url`, `resolution_text_url`.

#### Backend
*   Reconfiguración de `multer` para aceptar múltiples campos específicos: `photo`, `file`, `resolution_photo`, `resolution_doc`.
*   Nuevos endpoints: `GET /categories` para alimentar los desplegables del frontend de forma dinámica.

#### Frontend
*   **Creación:** Formulario con dos botones de subida independientes ("📷 Foto" y "📄 Documento").
*   **Edición Completa:** Se añadió la capacidad de **sustituir la foto y el documento original** desde el modal de edición, además de las pruebas de resolución.
*   **Categorías Dinámicas:** Los desplegables se pueblan automáticamente con las categorías existentes en la base de datos.
*   **UX y Visualización:**
    *   **Visor de Documentos Integrado:** Implementado un modal que usa `fetch` para leer archivos `.txt` y `.md`.
    *   **Renderizado Markdown:** Integración de la librería `marked.js` para visualizar archivos Markdown con formato rico (encabezados, negritas, etc.).
    *   **Corrección de Flujo:** Los botones de documentos en el listado ahora abren el visor en lugar de forzar la descarga.
    *   **Gestión de Capas (Z-Index):** Ajuste de niveles de profundidad para que los visores de archivos aparezcan siempre por encima del modal de detalle.

---

## 3. Estado Actual
La aplicación es funcional, estable y ofrece una gestión documental avanzada.
*   **Soporte Multi-archivo:** Gestión independiente de evidencias gráficas y documentales.
*   **Visualización Rica:** Lectura de informes en Markdown directamente en la app.
*   **Dinamicidad:** Las categorías crecen orgánicamente con el uso de la aplicación.

---

## 4. Sugerencias y Próximos Pasos
1.  **Limpieza de Archivos Huérfanos:** Implementar lógica en el backend para borrar archivos físicos del disco cuando se sustituyen mediante `PATCH`.
2.  **Modularización:** Considerar separar `app.js` en módulos para facilitar el mantenimiento a largo plazo.
3.  **Búsqueda Avanzada:** Añadir filtros por rango de fechas en el listado de tareas.
