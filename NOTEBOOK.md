# Notebook de Seguimiento - Gestor de Tareas

**Fecha:** 2 de Marzo de 2026
**Contexto:** Intervención técnica sobre repositorio `gestor-tareas`.

## 1. Estado Inicial

Al tomar el proyecto, la aplicación presentaba una arquitectura funcional basada en Node.js (Express), SQLite y Docker (con Caddy como proxy), pero sufría de varios problemas críticos de estabilidad y funcionalidad reportados:

- **Bloqueo Crítico:** No se podían crear tareas con archivos adjuntos. El servidor fallaba silenciosamente o rechazaba la petición.
- **Problemas de Despliegue:** Puerto 3000 y 8443 inaccesibles por conflictos de red y procesos.
- **Limitación Funcional:** Todo se trataba como "foto", impidiendo subir documentos.

---

## 2. Bitácora de Soluciones y Mejoras

### Fase 1 a 6: Estabilización y Modularización

- Unificación de redes Docker y corrección de puertos.
- Refactorización del Frontend a **Módulos ES6**.
- Validación de datos con **Zod** y soporte de coordenadas regionales.
- Gestión automática del ciclo de vida de archivos (borrado de huérfanos).
- Exportación a CSV y búsqueda por fechas.

### Fase 7: Auditoría y Experiencia de Usuario (10 Feb 2026)

- **Historial de Cambios (Audit Log):** Tabla `issue_logs` y visualización integrada en el modal de detalle.
- **Notificaciones Visuales:** Badges en tiempo real (Polling 30s) para tareas Abiertas/Proceso/Resueltas.
- **Edición Avanzada:** Se ha implementado la capacidad de cambiar la **Categoría** de una tarea desde el modal de edición.
- **Infraestructura:** Backups diarios automáticos y CI/CD con GitHub Actions.

### Fase 8: Autenticación Real y Seguridad (10 Feb 2026)

- **Sistema de Usuarios:** Implementación de tabla `users` con contraseñas hasheadas (`bcryptjs`) y roles (`admin`, `user`).
- **JWT:** Sustitución/Hibridación del sistema de API Key por tokens JWT (`jsonwebtoken`).
- **UI de Acceso:**
  - Modal de Login con opción de mostrar contraseña ("ojo") y cambio a modo Registro.
  - Modal de Perfil de Usuario para cambio de contraseña.
  - Botón de "Cerrar Sesión" e identificación visual del usuario activo.
- **Auditoría Identificada:** Los logs de cambios ahora registran el ID del usuario que realizó la acción.

---

## 3. Estado Actual

El sistema cuenta con una arquitectura de seguridad profesional. Los usuarios pueden registrarse, iniciar sesión y gestionar su perfil. Todas las acciones quedan auditadas. El despliegue en Docker es estable bajo HTTPS. Incluye centro de notificaciones en tiempo real (comentarios y respuestas), asignación de tareas, prioridades editables, plan de backup automatizado y documentación actualizada (README.md).

---

## 4. Bitácora de RBAC y Funcionalidades (11 Feb 2026)

### Fase 9: Gestión de Usuarios y Roles (RBAC Completo) ✅

- **Propiedad de Tareas:**
  - Columna `created_by` añadida a tabla `issues`.
  - Migración automática: Tareas huérfanas asignadas al admin (ID 1).
  - Visualización del autor en Lista y Detalle (visible solo para admins).
- **Seguridad y Permisos:**
  - Usuarios normales solo ven y editan *sus* propias tareas.
  - Administradores tienen acceso global (ver, editar, borrar todo).
  - Endpoint `GET /users` y `PATCH /users/:id` protegidos para gestión de roles.
- **Panel de Administración:**
  - Nuevo botón "👥 Usuarios" en el header (visible solo para admins).
  - Modal de gestión de usuarios:
    - Listado de usuarios con fecha de registro y rol.
    - Edición de rol (User <-> Admin).
    - Cambio de contraseña de otros usuarios (reset administrativo).
    - Eliminación de usuarios (con protección para no borrarse a uno mismo).

### Fase 10: Refinamiento y Tests ✅

- **Tests Automatizados:**
  - Creado `tests/auth.test.js` cubriendo flujos de RBAC y gestión de usuarios.
  - Corregidos tests heredados (`api`, `files`, `logs`) para cumplir con las nuevas restricciones de FK y cabeceras CSV.
- **Optimizaciones de UI/UX:**
  - **Paginación de Usuarios:** Implementada en backend (`LIMIT/OFFSET`) y frontend (botones « » en modal de usuarios).
  - **Feedback Visual en Mapa:** Los marcadores de tareas ajenas ahora tienen un borde distintivo (blanco/grueso) para administradores, facilitando la distinción de autoría de un vistazo.
  - **Resiliencia:** El sistema ahora asegura la existencia de un usuario admin (ID 1) por defecto para evitar fallos de integridad en instalaciones nuevas o tests.

### Fase 11: Biblioteca de Planos Multi-usuario ✅

- **Base de Datos:**
  - Tabla `maps` creada para almacenar metadatos de planos (nombre, archivo, dueño).
  - Columna `map_id` añadida a `issues` para vincular tareas a un plano específico.
  - Migración automática: Mapa "Principal" por defecto creado y asignado a tareas existentes.
- **Gestión de Mapas:**
  - Nuevo módulo UI "🗺️ Planos" accesible desde el header.
  - Funcionalidad para **subir nuevos planos** (imágenes) y **seleccionar el activo**.
  - RBAC: Usuarios ven sus propios planos y los del sistema (admin); Admins ven todos.
- **Integración en Mapa y Tareas:**
  - El visor de mapa carga dinámicamente la imagen del plano seleccionado.
  - Al crear una tarea, se asocia automáticamente al plano activo (`map_id`).
  - El listado de tareas filtra visualmente las incidencias según el plano seleccionado.

### Fase 12: Refinamiento de Accesibilidad y UX ✅

- **Formularios:** Añadidos atributos `autocomplete` (`username`, `current-password`, `new-password`) para compatibilidad con gestores de contraseñas.
- **Accesibilidad ARIA:** Corregido conflicto de `aria-hidden` en modales para mejorar la navegación con lectores de pantalla.
- **Estabilidad:** Migración de base de datos convertida a asíncrona para garantizar la integridad de las claves foráneas en el arranque y tests.

### Fase 13: Inversión de Control Lista-Mapa ✅

- **Lista Global:** La lista de tareas ahora carga todas las incidencias del usuario (independientemente del plano activo).
- **Cambio Automático de Plano:** Al seleccionar una tarea de la lista, la aplicación cambia automáticamente al plano (`map_id`) correspondiente y centra la vista en la tarea.
- **Filtrado Visual del Mapa:** El mapa sigue filtrando visualmente los marcadores para mostrar solo los que pertenecen al plano que se está visualizando en ese momento.

---

## 5. Registro de Fases Completadas

Las funcionalidades de comunicaciones, comentarios, recuperación de contraseña, asignación de tareas y optimización móvil ya están implementadas. Véase: [Fase 18](#fase-18-gestión-de-comunicaciones-y-notificaciones-14-feb-2026-), [Fase 20](#fase-20-sistema-de-comunicación-comentarios-), [Fase 22](#2026-02-15--fase-22-sistema-de-comentarios-avanzado-), [Fase 23](#2026-02-15--fase-23-recuperación-de-cuentas-password-reset-), [Fase 25](#2026-02-15--fase-25-asignación-de-tareas-y-rescate-de-datos-) y [Fase 27](#2026-02-25--fase-27-optimización-móvil-avanzada-y-corrección-ui-). Para el estado actual de pendientes, véase la [sección 7. Próximos Pasos](#7-próximos-pasos-hoja-de-ruta). Para sugerencias de nuevas prestaciones, véase la [sección 8](#8-sugerencias-de-nuevas-prestaciones).

### Fase 14: Gestión de Planos, Búsqueda Avanzada y Dashboard (12 Feb 2026) ✅

- **Gestión de Planos en Edición:** Implementada la capacidad de reasignar una tarea a un plano diferente desde el modal de edición, incluyendo actualización en DB y logging.
- **Búsqueda Avanzada por Usuario:** La barra de búsqueda global ahora permite filtrar tareas por el nombre de usuario del autor, integrando un `LEFT JOIN` en el backend.
- **Dashboard de Estadísticas:**
  - Integración de **Chart.js** para visualización dinámica.
  - Gráficas de distribución por estado (Doughnut) y categoría (Bar) accesibles para todos.
  - Gráfica de productividad por usuario (Top 5) exclusiva para administradores.
  - Restauración de la funcionalidad de badges en tiempo real (Polling 30s) integrada en el nuevo módulo de estadísticas.

### Fase 15: Exportación Profesional de Estadísticas (14 Feb 2026) ✅

- **Exportación a PNG con Fondo Sólido:** Implementado un plugin nativo de Chart.js para garantizar que los gráficos exportados tengan un fondo opaco (oscuro o claro según el tema), evitando que el texto blanco sea invisible.
- **Informe PDF Completo:** Integración de `jsPDF` y `html2canvas` para generar informes PDF que incluyen títulos, fechas y todos los gráficos en un formato profesional.
- **Sincronización de Entorno:** Resolución de inconsistencias entre el código local y el contenedor Docker, garantizando un despliegue limpio y funcional.

### Fase 16: Optimización Real y Arquitectura ARM64 (14 Feb 2026) ✅

- **Compatibilidad Nativa ARM64:** Configuración explícita de `platform: linux/arm64` en `docker-compose.yml` para optimizar el rendimiento en sistemas Apple Silicon y similares.
- **Robustez en Construcción:** Actualización del `Dockerfile` con herramientas de compilación (`python3`, `make`, `g++`) para asegurar que dependencias nativas como `sqlite3` y `sharp` se construyan correctamente bajo cualquier arquitectura.
- **Flujo de Trabajo Flexible:** Ajuste de los hooks de Git (Husky) para permitir el desarrollo fluido en entornos con discrepancias de arquitectura entre el host y el contenedor, priorizando siempre la estabilidad del entorno de ejecución real (Docker).

### Fase 17: Revisión de Código, Seguridad y Refactorización (14 Feb 2026) ✅

- **Unificación de Autenticación:** Se ha eliminado la función redundante `authenticateToken` en las rutas de autenticación, integrando el middleware centralizado `requireAuth()` en todo el backend para una mayor consistencia y facilidad de mantenimiento.
- **Blindaje de Rutas:** Identificadas y corregidas vulnerabilidades de acceso en los endpoints de logs (`/v1/issues/:id/logs`) y categorías (`/v1/issues/categories`), que ahora requieren autenticación obligatoria.
- **Robustez en Migraciones:** Refactorización de `src/db/sqlite.js` utilizando patrones `async/await`. Esto garantiza que la base de datos esté lista y sea coherente antes de que el servidor acepte conexiones, evitando fallos de integridad en el arranque.
- **Seguridad de Administrador:** Implementado soporte para la variable de entorno `ADMIN_PASSWORD`. Ahora, el sistema puede inicializar o actualizar la contraseña del administrador por defecto (`admin`) de forma segura mediante un hash de `bcrypt`, eliminando el uso de credenciales bloqueadas o hardcodeadas.
- **Limpieza de Código:** Eliminación de importaciones duplicadas, código muerto y mejora de la legibilidad general en los archivos críticos del núcleo (`sqlite.js`, `auth.routes.js`, `issues.routes.js`).

### Fase 18: Gestión de Comunicaciones y Notificaciones (14 Feb 2026) ✅

- **Base de Datos Extendida:** Incorporación de la columna `email` (única y opcional) en la tabla `users` mediante una migración suave y segura.
- **Flujo de Usuario Mejorado:** Actualización de los esquemas de registro y login para capturar y devolver el correo electrónico del usuario, integrándolo también en el payload del token JWT.
- **Servicio de Notificaciones por Email:** Implementación de `src/services/mail.service.js` utilizando `nodemailer`. El servicio soporta configuración vía variables de entorno (`SMTP_HOST`, `SMTP_PORT`, etc.) y cuenta con un modo de depuración para desarrollo.
- **Automatización de Avisos:**
  - **Notificación al Administrador:** Envío automático de un correo al `ADMIN_EMAIL` cada vez que se registra una nueva incidencia en el sistema.
  - **Aviso de Cambio de Estado:** Notificación inmediata al autor de una tarea cuando su estado cambia (ej. de "Abierta" a "En Proceso"), siempre que el usuario tenga un correo configurado.
- **Resiliencia en Tests:** Corrección de la suite de pruebas automatizadas para reflejar el blindaje de rutas y asegurar que todos los flujos de comunicación funcionan bajo condiciones de carga real.

### Fase 19: Estabilidad Nuclear y Refinamiento de Perfil (14 Feb 2026) ✅

- **Robustez Extrema en DB:**
  - Refactorización de `src/db/sqlite.js` con apertura asíncrona real y configuración de `PRAGMA busy_timeout=5000`. Esto elimina los errores de "base de datos bloqueada" en entornos concurrentes.
  - Activación forzada de modo `WAL` y `Foreign Keys` en cada apertura de conexión.
- **Resolución de Rutas Inteligente:**
  - Mejora en `src/config/paths.js` para detectar el entorno de ejecución. El sistema ahora ignora automáticamente rutas absolutas de Docker (`/app/...`) cuando detecta que se ejecuta en el host local, evitando fallos de arranque catastróficos.
- **Sincronización de Entorno:**
  - Unificación del archivo `.env` utilizando rutas relativas, garantizando compatibilidad total entre desarrollo local y despliegue en contenedores.
  - Inclusión de `JWT_SECRET` persistente para evitar la invalidación de sesiones en reinicios.
- **Experiencia de Usuario (Perfil):**
  - **Flexibilidad en Actualización:** Ahora es posible cambiar el email sin necesidad de introducir la contraseña actual, solicitándola únicamente cuando se desea establecer una nueva clave.
  - **Refinamiento de UI:** Actualización del modal de perfil con textos más claros ("Actualizar Perfil") y campos opcionales en el frontend para evitar confusiones.
- **Corrección de Integración:** Resolución de errores de importación en `app.js` (`fetchJson`, `API_BASE`) que impedían el refresco dinámico de los datos del usuario tras cambios en el perfil.

### Fase 20: Sistema de Comunicación (Comentarios) ✅

- **Infraestructura de Datos:**
  - Creación de la tabla `issue_comments` en SQLite.
  - Implementación de integridad referencial (FK) con borrado en cascada para mantener la base de datos limpia al eliminar tareas o usuarios.
- **API de Comentarios:**
  - Nuevo módulo de rutas `src/routes/comments.routes.js`.
  - Endpoints para listar y crear comentarios protegidos por autenticación JWT.
- **Interfaz de Usuario:**
  - Inyección dinámica de la sección de comentarios en el modal de detalles.
  - Sistema de scroll automático al recibir nuevos mensajes.
  - Feedback visual de carga y errores mediante `toast` y estados de botón.

### Fase 21: Saneamiento del Repositorio ✅

- **Eliminación de Redundancias:**
  - Borrado de bases de datos antiguas y duplicadas (`data.db`, `data.sqlite`).
  - Eliminación de duplicados de imágenes en el frontend (`plano.jpeg`).
- **Seguridad y Limpieza:**
  - Borrado de certificados locales de Caddy (`*.crt`, `*.der`) para evitar su versionado accidental.
  - Limpieza de archivos de log temporales (`server.log`).
- **Mantenimiento Preventivo:**
  - Mejora de `.gitignore` para cubrir de forma más robusta archivos de base de datos, logs y certificados locales.

### 2026-02-15 | Fase 22: Sistema de Comentarios Avanzado ✅

- **Hilos de Respuestas:** Implementación de la columna `parent_id` en la tabla `issue_comments` para soportar anidamiento.
- **API Recursiva:** Refactorización del endpoint de comentarios para devolver una estructura de árbol, permitiendo conversaciones jerárquicas.
- **UI Dinámica:**
  - Visualización de respuestas con sangría y borde distintivo.
  - Botón "Responder" que precarga el contexto del comentario padre.
  - Indicador visual de "Respondiendo a @usuario" con opción de cancelación.

### 2026-02-15 | Fase 23: Recuperación de Cuentas (Password Reset) ✅

- **Infraestructura de Email:**
  - Integración de **Mailpit** en el entorno local (Puerto 8825) para captura y previsualización segura de correos.
  - Configuración de `PUBLIC_URL` para la generación dinámica de enlaces de recuperación.
- **Seguridad:**
  - Nueva tabla `password_resets` para gestionar tokens de un solo uso con expiración (1 hora).
  - Uso de `crypto` nativo de Node.js para la generación de tokens de alta entropía.
- **Flujo de Usuario:**
  - Modales de "Olvido de contraseña" y "Restablecer clave" integrados en el login.
  - Detección automática de tokens mediante URL fragments (`#reset-password?token=...`).
- **Resiliencia y Compatibilidad:**
  - **Limpieza de Rutas:** Middleware en Express para interceptar y limpiar el prefijo `/cola-ciudadana`, garantizando que la app funcione tras cualquier proxy inverso.
  - **Migraciones Robustas:** Mejora en el sistema de migración de DB para añadir columnas faltantes en caliente sin interrumpir el arranque del servidor (evita errores 502).

### 2026-02-15 | Fase 24: Identidad, Coherencia y Flujo de Desarrollo ✅

- **Unificación de Marca:**
  - Renombrado del servicio principal de `cola-ciudadana` a `**gestor-tareas`** en Docker Compose.
  - Actualización de volúmenes de persistencia a `gt_data` y `gt_uploads`.
- **Simplificación de Infraestructura:**
  - Eliminación del prefijo `/cola-ciudadana` en rutas y Caddy. La aplicación ahora responde en la raíz (`/`), facilitando el despliegue.
  - Limpieza de middlewares de parche en `src/app.js` y normalización de la generación de enlaces de email.
- **Optimización del Flujo de Trabajo (Husky + Docker):**
  - **Tests en Contenedor:** Refactorización del pre-commit hook para ejecutar la suite de pruebas automáticamente dentro del contenedor Docker. Esto garantiza la validez de los tests en el entorno de ejecución real, independientemente de la arquitectura del host (Mac/Windows/Linux).
  - **Entorno de Desarrollo Dinámico:** Modificación del `Dockerfile` y `docker-compose.yml` para soportar `NODE_ENV=development` localmente, permitiendo la instalación de herramientas de test (`jest`, `supertest`) solo cuando son necesarias.
  - **Eliminación de Falsos Positivos:** El flujo de commit es ahora limpio, sin avisos de arquitectura o fallos por dependencias locales faltantes.

### 2026-02-15 | Fase 25: Asignación de Tareas y Rescate de Datos ✅

- **Sistema de Asignación Profesional:**
  - **Base de Datos:** Incorporación de la columna `assigned_to` en la tabla `issues` con integridad referencial.
  - **Notificaciones Automáticas:** Envío de correos electrónicos al responsable cuando se le asigna una nueva tarea (integrado con Mailpit).
  - **Auditoría Detallada:** El historial de cambios ahora registra automáticamente cada reasignación de responsable.
- **Acceso Universal (Login Dual):**
  - Implementación de inicio de sesión tanto por **Nombre de Usuario** como por **Email**.
  - **Case-Insensitivity:** La búsqueda de usuario/email ahora ignora mayúsculas/minúsculas para evitar errores comunes de entrada.
- **Recuperación Crítica de Datos:**
  - **Rescate de Volúmenes:** Localización y extracción exitosa de la base de datos y archivos multimedia de volúmenes antiguos de Docker (`cola-ciudadana_cola_data` y `gestor-tareas_cola_uploads`).
  - **Migración a Bind Mounts:** Cambio de volúmenes nombrados a mapeos de carpetas locales (`./data` y `./uploads`), garantizando que los datos sean visibles, persistentes y fáciles de respaldar desde el host.
  - **Corrección de Infraestructura:** Actualización de `docker-compose.caddy.yml` y el `Caddyfile` interno para resolver errores 502 causados por el cambio de identidad del servicio.
- **Robustez y Estabilidad:**
  - **Borrado Determinista:** Refactorización de la lógica de eliminación de archivos para que sea asíncrona y esperada (`await`). Esto elimina las condiciones de carrera que hacían fallar los tests automatizados.
  - **Depuración de UI:** Corrección de errores en la carga de usuarios paginados que causaban fallos en la consola al abrir detalles de tareas o formularios de creación.

### 2026-02-24 | Fase 26: Recuperación de Infraestructura y Estabilidad de Montajes ✅

- **Resolución de Incidente Crítico (ENOTDIR/Bad File Descriptor):**
  - Detectado fallo masivo en el acceso al sistema de archivos dentro de los contenedores debido a una corrupción de los descriptores de archivos en el motor de Docker para Mac.
  - **Síntomas:** Error 404 al servir `index.html`, fallos en backups y bases de datos marcadas como inaccesibles.
  - **Solución:** Reinicio determinista de la infraestructura (`down` + `up --build`) para restaurar los enlaces entre el host (macOS) y el sistema de archivos de los contenedores.
- **Validación de Salud:**
  - Verificación de la integridad de los volúmenes `/app/src`, `/app/data` y `/app/uploads`.
  - Confirmación de respuesta exitosa (HTTP 200) sobre el proxy Caddy en `https://localhost:8443`.

### 2026-02-25 | Fase 27: Optimización Móvil Avanzada y Corrección UI ✅

- **Interacción Táctica del Mapa:**
  - Habilitado control de zoom en móviles (esquina inferior derecha) para mejorar la precisión frente al pellizco manual.
  - Ajustada la configuración de Leaflet para usar `tap` nativo y `touch-action`, eliminando retardos en la respuesta.
- **Refinamientos de UI/UX:**
  - **Header Adaptativo:** Implementado scroll lateral en la barra de controles para evitar el amontonamiento de botones en pantallas estrechas.
  - **Estadísticas Legibles:** Forzada altura mínima en los gráficos de Chart.js para evitar el colapso visual en vertical.
  - **Prevención de Auto-zoom:** Unificado el tamaño de fuente a 16px en todos los inputs para evitar que iOS haga zoom automático intrusivo al escribir.
- **Bug Fix (Botón Salir en Móvil):**
  - **Culpable:** El contenedor con `overflow-x: auto` capturaba los eventos táctiles antes que el botón, sumado al bloqueo de diálogos `confirm()` por parte de algunos navegadores móviles.
  - **Solución:** Eliminación del `confirm()` para un cierre de sesión instantáneo y optimización de capas (`z-index`) y eventos (`addEventListener` con `stopPropagation`) para garantizar la pulsación.

### 2026-02-25 | Fase 28: Corrección de Identidad Visual (Favicon) ✅

- **Soportes de Favicon:**
  - Inserción de etiquetas `<link>` en `index.html` para soportar `apple-touch-icon`, favicons de 32x32 y 16x16, y el `shortcut icon` clásico.
  - Vinculación del archivo `site.webmanifest` para soporte de PWA y Android.
- **Corrección de Rutas:**
  - Ajuste de las rutas internas en `src/public/icons/site.webmanifest` para que apunten correctamente a los archivos PNG desde su ubicación relativa.

### 2026-02-25 | Fase 29: Actualización en Tiempo Real (WebSockets) ✅

- **Infraestructura de Tiempo Real:**
  - Integración de **Socket.io** en el backend.
  - Refactorización de `src/server.js` para envolver la aplicación Express en un servidor HTTP nativo compatible con WebSockets.
  - Creación del servicio centralizado `src/services/socket.service.js` para gestionar la instancia global de `io`.
- **Comunicación Bidireccional:**
  - Emisión automática de eventos (`issue:created`, `issue:updated`, `issue:deleted`) desde las rutas de la API ante cualquier cambio en la base de datos.
  - Integración de la librería cliente de Socket.io en el frontend.
  - Creación del módulo `src/public/ui/modules/socket.js` para la escucha activa de eventos y ejecución de refrescos reactivos.
- **UX Reactiva:**
  - Refresco instantáneo de la lista de tareas y marcadores del mapa cuando un tercero realiza una acción.
  - Actualización automática de los badges de estadísticas en el header sin esperar al polling.
  - Implementación de notificaciones `toast` ligeras ante la creación de nuevas tareas por otros usuarios.

### 2026-02-25 | Fase 30: Configuración en Caliente (Hot Config) ✅

- **Infraestructura de Persistencia:**
  - Creación de la tabla `settings` en SQLite para el almacenamiento de parámetros globales.
  - Implementación de un sistema de migración automática que garantiza la existencia de la tabla al arrancar.
- **Servicio de Configuración Avanzado:**
  - Creación de `src/services/config.service.js` con soporte para caché en memoria.
  - Lógica de fallback inteligente: busca primero en la base de datos y, si no existe, recurre a las variables de entorno (`process.env`).
- **API de Administración:**
  - Endpoint `GET /v1/settings` para recuperar la configuración actual (restringido a administradores).
  - Endpoint `PATCH /v1/settings` para actualizar múltiples valores de forma atómica.
  - Integración con WebSockets: se emite el evento `settings:updated` para notificar cambios en tiempo real a otros administradores conectados.
- **Panel de Control UI:**
  - Nuevo módulo `src/public/ui/modules/settings.js` para la gestión visual de parámetros.
  - Modal de configuración integrado en el header (visible solo para admins) que permite ajustar:
    - Límite de tamaño de subida de archivos.
    - Email de administración para notificaciones.
    - URL pública de la aplicación.
    - Activación y parámetros del Rate Limit (seguridad).

### 2026-02-27 | Fase 31: Incidente de Datos, Blindaje y Reset de Fábrica ✅

- **Incidente Crítico de Datos:**
  - **Causa:** Durante el refuerzo de tests (Fase 30), la ejecución de pruebas automatizadas sobre el volumen externo (`/Volumes/ESSAGER`) provocó un borrado accidental de las tablas `users` y `settings` en la base de datos de producción. Esto ocurrió debido a la falta de aislamiento entre el entorno de desarrollo y el de tests en la configuración de SQLite.
  - **Impacto:** Pérdida de cuentas de usuario adicionales y desvinculación de la autoría de las tareas existentes (asignadas automáticamente a `NULL`).
- **Medidas de Contingencia y Blindaje:**
  - **Aislamiento de Tests:** Modificación de `src/config/paths.js` para detectar el entorno `NODE_ENV=test`. Ahora, las pruebas utilizan automáticamente un archivo de base de datos separado (`data/test.db`), garantizando que los datos reales nunca vuelvan a ser afectados.
  - **Restauración de Acceso:** Ejecución de un script de emergencia para recrear el usuario `admin` (ID 1) con contraseña predeterminada, devolviendo el control del sistema al administrador.
- **Saneamiento y Reset Consentido:**
  - **Limpieza Total:** A petición del usuario y ante la imposibilidad de recuperar los nombres de los usuarios borrados (sin backups previos), se ha procedido a un reset de fábrica de las tablas de datos dinámicos.
  - **Tablas Limpiadas:** `issues`, `issue_logs`, `issue_comments`, `settings` y `users` (excepto ID 1).
  - **Preservación de Activos:** La tabla `maps` y los archivos de imagen de los planos se han mantenido intactos, reasignando su propiedad al administrador único actual.
  - **Purga de Archivos:** Ejecución del script `uploads-prune` en modo real para eliminar todas las fotografías y documentos asociados a las tareas ya inexistentes, liberando espacio en disco.
- **Estado de Calidad (Linter):**
  - Aplicación de parches de código para resolver más de 30 advertencias de ESLint relacionadas con variables no usadas y globales no declaradas, resultando en un código más limpio y profesional.
- **Corrección de Coordenadas:** Se han eliminado las restricciones de rango GPS (-90 a 90) en `src/schemas/issue.schema.js` para permitir el uso de coordenadas técnicas/píxeles sobre planos de imagen de gran tamaño.
- **Garantía Técnica Final:**
  - Verificación del sistema en un entorno Docker limpio.
  - Ejecución exitosa de la suite completa de 35 tests (incluyendo los nuevos de WebSockets y Settings) en un contenedor aislado.
  - Validación de salud exitosa sobre el proxy Caddy (`HTTP 200`).

### 2026-03-02 | Fase 31b: Plan de Backup y Recuperación Automatizada ✅

- **Contexto:** Tras el incidente de Fase 31 (pérdida de datos sin backups), se implementa un plan integral de backup y recuperación.
- **Mecanismo de Backup (verificado y reforzado):**
  - `src/cron/backup.js` ejecuta backups automáticos cada 24h (configurable con `BACKUP_INTERVAL_MS`).
  - Backup full: copia de `data.db` y comprimido tar.gz de `uploads`.
  - **Protección NODE_ENV=test:** Los backups están deshabilitados cuando `NODE_ENV=test`; nunca se respalda `test.db`.
  - `paths.js`: `getBackupDir()` retorna `null` en entorno test; `getDbFile()` ya aislaba tests.
- **Retención y purga:**
  - `BACKUP_RETENTION_DAYS` (default 7): backups más antiguos se purgan automáticamente.
  - Script `backup-prune`: purga manual auditable (dry-run por defecto, `PRUNE=1` para ejecutar).
- **Restauración:**
  - Script `backup-restore.js`: lista backups; con `RESTORE=1 BACKUP_DB=<archivo> [BACKUP_UPLOADS=<archivo>]` restaura BD y/o uploads.
  - Rechaza restauración en `NODE_ENV=test` salvo `RESTORE_TO_TEST=1` (para CI).
- **Scripts npm:** `npm run backup`, `npm run backup:restore`, `npm run backup:prune`, `npm run uploads:prune`.
- **CI:** Job `restore-test` ejecuta `tests/restore.test.js` (ciclo backup → restore → verificación).
- **uploads-prune:** Actualizado para usar `paths.js` y rechazar en `NODE_ENV=test` salvo `PRUNE_FORCE=1`.
- **Procedimientos documentados:** Ver Readme.md y esta sección para retención y recuperación.

### 2026-02-28 | Fase 32: Sistema de Prioridades y Fechas Límite ✅

- **Base de Datos:**
  - Incorporación de las columnas `priority` (low, medium, high, critical) y `due_date` (ISO date) en la tabla `issues`.
  - Sistema de migración automática (`ALTER TABLE`) para preservar la compatibilidad.
- **Backend y Validación:**
  - Actualización de los esquemas Zod para la validación estricta de prioridades y formatos de fecha.
  - Mejora de la ruta de exportación CSV para incluir los nuevos campos.
  - Implementación de auditoría automática: cada cambio de prioridad o fecha límite se registra en el historial (`issue_logs`).
- **Interfaz de Usuario (UI/UX):**
  - **Formularios Reactivos**: Selectores de prioridad con indicadores visuales y selectores de fecha integrados en creación y edición.
  - **Visualización en Lista**: Los niveles de urgencia se muestran con colores semánticos (Rojo para Crítica, Naranja para Alta). Las fechas de vencimiento aparecen con alerta visual si están próximas o pasadas.
  - **Mapa Inteligente**: Los marcadores ahora reflejan la urgencia mediante el grosor y color del borde (ej. borde rojo grueso para tareas críticas), facilitando el triaje visual sobre el plano.
- **Validación de Calidad:**
  - Actualización de la suite de tests (`tests/api.test.js`) para reflejar los nuevos formatos de datos y exportación.
  - Confirmación de paso exitoso de los 35 tests en entorno Docker.

### 2026-02-28 | Fase 33: Modo Offline y PWA ✅

- **Infraestructura PWA:**
  - Actualización del manifiesto (`site.webmanifest`) con identidad visual corporativa y soporte para iconos "maskable".
  - Implementación del **Service Worker** (`sw.js`) para la gestión avanzada de caché.
- **Estrategias de Caché:**
  - **Cache First**: Para archivos estáticos (HTML, CSS, JS) e imágenes del plano, garantizando carga instantánea.
  - **Librerías Externas**: Almacenamiento local de recursos críticos de CDNs (Leaflet, Chart.js, Socket.io, marked) para funcionamiento 100% offline de la interfaz.
- **UX y Resiliencia:**
  - Registro automático del Service Worker en el arranque.
  - Preparación de la interfaz para navegación sin conexión (los planos y tareas cacheadas son accesibles).

### 2026-02-28 | Fase 34: Integración con Códigos QR ✅

- **Deep Linking y Navegación Directa:**
  - Implementación de lógica en `app.js` para detectar parámetros `?issue=ID` y `?map=ID` en la URL.
  - La aplicación ahora carga automáticamente el plano correcto y abre el detalle de la tarea si se accede vía enlace directo.
- **Generación Dinámica de QR:**
  - Integración de `qrcode.js` para la creación de códigos QR en el cliente.
  - Nuevo módulo `src/public/ui/modules/qr.js` que centraliza la lógica de codificación y visualización.
- **Interfaz de Usuario QR:**
  - **En Tareas:** Botón "🔳 QR" en el modal de detalles para facilitar la identificación física de activos.
  - **En Planos:** Botón QR en la lista de planos para acceso rápido a zonas específicas del edificio/instalación.
  - **Funciones de Exportación:** Modal QR con opciones para **copiar enlace directo** y **descargar imagen PNG**, optimizado para técnicos que necesiten imprimir etiquetas QR.
- **Refuerzo de UX Offline:**
  - Implementación de indicadores visuales de estado "Sin conexión" (filtro escala de grises suave y toast informativo) para mejorar la experiencia PWA en campo.

### 2026-03-01 | Fase 35: Herramientas de Dibujo (Zonas) ✅

- **Infraestructura de Datos**:
  - Creación de la tabla `map_zones` en SQLite para persistir áreas geométricas asociadas a planos.
  - Soporte para almacenamiento de **GeoJSON**, color, nombre y autoría.
- **Backend API**:
  - Nuevos endpoints en `src/routes/maps.routes.js` para el CRUD de zonas con validación **Zod**.
  - Implementación de RBAC: los usuarios solo pueden editar/borrar sus propias zonas, mientras que los admins tienen control total.
- **Interfaz de Usuario (Mapa)**:
  - Integración de **Leaflet.draw** para permitir dibujar polígonos y rectángulos directamente sobre el plano.
  - Sistema de persistencia automática: al crear, editar o borrar una zona en el mapa, los cambios se sincronizan inmediatamente con el servidor.
  - Visualización dinámica: las zonas se cargan automáticamente al cambiar de plano, con tooltips informativos que muestran el nombre de la zona al pasar el cursor.
  - Control de interacción: se previene la creación accidental de tareas mientras las herramientas de dibujo están activas.

### 2026-03-06 | Fase 37: Capas de Planos (Technical Layers) ✅

- **Infraestructura de Datos**:
  - Incorporación de la columna `parent_id` en la tabla `maps` para soportar estructuras jerárquicas.
  - Implementación de migración automática y claves foráneas con borrado en cascada.
- **API de Planos Extendida**:
  - Actualización de `POST /v1/maps` para aceptar la vinculación a un mapa padre.
  - El detalle de un plano (`GET /v1/maps/:id`) ahora devuelve automáticamente sus capas técnicas asociadas.
- **Gestión de Capas en UI**:
  - **Selector de Vinculación**: El formulario de subida de planos ahora permite elegir si la imagen es un plano base o una capa técnica de otro existente.
  - **Visualización Jerárquica**: La lista de planos organiza visualmente las capas bajo sus padres mediante indentación y símbolos distintivos (↳).
- **Interacción Avanzada en Mapa**:
  - **Control de Capas Leaflet**: Integración de un control nativo (`L.control.layers`) en la esquina superior derecha.
  - **Superposición Técnica**: Las capas se cargan como `L.imageOverlay` con transparencia ajustable (70% por defecto) sobre el plano base, permitiendo ver instalaciones (electricidad, fontanería, etc.) de forma simultánea.
  - **Carga Dinámica**: Al cambiar de plano base, el control de capas se refresca automáticamente con las nuevas opciones disponibles.

### 2026-03-07 | Fase 38: Correcciones de Comentarios, Mailpit, Recorte y Perfil ✅

- **Correos en Mailpit:**
  - Ajuste en `mail.service.js`: si hay `SMTP_HOST` o `SMTP_PORT` configurados (ej. Mailpit), se envían correos aunque no exista `SMTP_USER`. Antes solo se logueaba en consola en desarrollo.
  - Los correos de comentarios llegan ahora a Mailpit y son visibles en la interfaz web.
  - URL por defecto de Mailpit: `http://localhost:8825` (puerto externo en Docker).
- **Respuestas a Comentarios:**
  - Corregido el botón "Responder" en el árbol de comentarios: sustituido `onclick` inline (fallaba con comillas en nombres de usuario) por `addEventListener` con closure.
  - El indicador "Respondiendo a @usuario" y el botón de cancelar funcionan correctamente.
- **Recorte/Ubicación en Plano:**
  - Nueva sección "📍 Ubicación en plano" en el modal de detalle de tarea.
  - Muestra el plano del mapa con un marcador en la posición (lat, lng) de la tarea.
  - Botón "Ver en mapa completo" para centrar el mapa principal en la ubicación.
- **Modal Perfil "Usuario no existe":**
  - Cuando `PATCH /auth/me` devuelve 404 (usuario borrado o sesión inválida), se cierra la sesión automáticamente tras 2,5 s y se redirige al login.
- **Otros:**
  - Toast de error al fallar el envío de comentarios.
  - Eliminada importación no usada de `state` en `app.js`.

---

## 6. Observaciones Pendientes (Recordatorio)

*Registro de observaciones y su estado (2026-03-02):*

1. **Enmarcados/recortes de plano (zonas):** ✅ *Solucionado.* Las zonas (rectángulos/polígonos) se visualizan sobre el plano al seleccionar un mapa. Se añadió texto de ayuda en la sección del mapa indicando dónde se muestran y cómo crear nuevas.
2. **Comentarios y correo:** ✅ *Solucionado.* Se implementó `notifyNewComment` en el servicio de correo. Al añadir un comentario, se envía notificación por email al autor de la tarea y al asignado (si tienen email configurado), visible en Mailpit.
3. **Acceso a Mailpit (Admin):** ✅ *Solucionado.* Botón "📧 Correos" en el header (solo admin) que abre la URL de Mailpit en nueva pestaña. Configurable en Configuración → `MAILPIT_URL` (por defecto `http://localhost:8825`).
4. **Acceso a Mailpit (Usuarios normales):** ⏳ *Pendiente.* Para que usuarios no-admin vean solo su correo, haría falta un proxy con autenticación que filtre por destinatario. Mailpit no soporta esto nativamente.

---

## 7. Próximos Pasos (Hoja de Ruta)

1. ~~📂 Capas de Planos~~ (completado en Fase 37).
2. **📊 Informes por Zona**: Capacidad de generar reportes de incidencias filtrados por las zonas dibujadas en el mapa.
3. **🎥 Soporte de Vídeo**: Permitir adjuntar clips cortos de vídeo como evidencia en las tareas.

---

## 8. Sugerencias de Nuevas Prestaciones

Propuestas de funcionalidades a incorporar, clasificadas por tipo de usuario.

### 8.1. Para Usuario Común

| Prioridad | Prestación | Descripción |
| --- | --- | --- |
| Alta | **Vista Kanban** | Alternar entre lista y vista de columnas (Abierta \| En proceso \| Resuelta) para gestión visual del flujo de trabajo. |
| Alta | **Calendario / Vista de plazos** | Vista de calendario con tareas por fecha límite; arrastrar para cambiar fechas. |
| Alta | **Recordatorios por email** | Opción de recibir recordatorio X días antes del vencimiento (configurable en perfil). |
| Media | **Etiquetas/Tags personalizados** | Crear etiquetas propias para filtrar y organizar tareas más allá de categorías. |
| Media | **Búsqueda en tiempo real** | Filtrado instantáneo mientras se escribe (título, descripción, autor). |
| Media | **Filtros combinados** | Combinar filtros (estado + prioridad + asignado + fecha + zona) con persistencia en sesión. |
| Media | **Menciones en comentarios** | Escribir `@usuario` para notificar directamente; integración con centro de notificaciones. |
| Media | **Exportación personal** | Exportar "Mis tareas" a CSV/PDF con filtros aplicados. |
| Baja | **Ordenación personalizable** | Guardar preferencias de orden (por fecha, prioridad, asignado) en perfil. |
| Baja | **Marcas de favoritos** | Marcar tareas como favoritas para acceso rápido (complementa "Mis tareas"). |

### 8.2. Para Administrador

| Prioridad | Prestación | Descripción |
| --- | --- | --- |
| Alta | **Informes por zona** | Generar reportes de incidencias filtrados por las zonas dibujadas en el mapa (pendiente de Fase 7). |
| Alta | **Gestión de categorías** | CRUD de categorías desde el panel de administración (crear, editar, eliminar, reordenar). |
| Alta | **Log de auditoría global** | Vista de todas las acciones del sistema (quién hizo qué y cuándo) con filtros y exportación. |
| Media | **Dashboard de usuarios** | Gráficas de actividad por usuario (tareas creadas, resueltas, tiempo medio) para supervisión. |
| Media | **Plantillas de tareas** | Definir plantillas predefinidas (categoría, prioridad, descripción base) para crear tareas rápidamente. |
| Media | **Notificaciones masivas** | Enviar avisos por email a todos los usuarios o a un subconjunto (por rol, por asignación). |
| Media | **Configuración de backups** | Ajustar intervalo, retención y destino de backups desde el panel de configuración. |
| Media | **API pública documentada** | Documentación OpenAPI/Swagger para integración con sistemas externos o automatización. |
| Baja | **Roles personalizados** | Definir roles más allá de admin/user (ej. supervisor, técnico) con permisos granulares. |
| Baja | **Herramientas de mantenimiento** | Botones en panel admin para ejecutar auditoría, reparación y prune de uploads sin terminal. |

---

## 9. Resumen de Metodología (15 Feb 2026) 🚀

- **Flujo Profesional consolidado**: El proyecto opera bajo un flujo de trabajo basado en **ramas de funcionalidad** (`feat/`) y validación mediante tests integrados en el pre-commit de Husky.
- **Soberanía de Datos**: El control de la persistencia ha pasado de Docker interno al sistema de archivos del usuario, facilitando el mantenimiento y la seguridad.
