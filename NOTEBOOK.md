# Notebook de Seguimiento - Gestor de Tareas

**Fecha:** 11 de Febrero de 2026
**Contexto:** Intervención técnica sobre repositorio `gestor-tareas`.

## 1. Estado Inicial
Al tomar el proyecto, la aplicación presentaba una arquitectura funcional basada en Node.js (Express), SQLite y Docker (con Caddy como proxy), pero sufría de varios problemas críticos de estabilidad y funcionalidad reportados:

*   **Bloqueo Crítico:** No se podían crear tareas con archivos adjuntos. El servidor fallaba silenciosamente o rechazaba la petición.
*   **Problemas de Despliegue:** Puerto 3000 y 8443 inaccesibles por conflictos de red y procesos.
*   **Limitación Funcional:** Todo se trataba como "foto", impidiendo subir documentos.

---

## 2. Bitácora de Soluciones y Mejoras

### Fase 1 a 6: Estabilización y Modularización
*   Unificación de redes Docker y corrección de puertos.
*   Refactorización del Frontend a **Módulos ES6**.
*   Validación de datos con **Zod** y soporte de coordenadas regionales.
*   Gestión automática del ciclo de vida de archivos (borrado de huérfanos).
*   Exportación a CSV y búsqueda por fechas.

### Fase 7: Auditoría y Experiencia de Usuario (10 Feb 2026)
*   **Historial de Cambios (Audit Log):** Tabla `issue_logs` y visualización integrada en el modal de detalle.
*   **Notificaciones Visuales:** Badges en tiempo real (Polling 30s) para tareas Abiertas/Proceso/Resueltas.
*   **Edición Avanzada:** Se ha implementado la capacidad de cambiar la **Categoría** de una tarea desde el modal de edición.
*   **Infraestructura:** Backups diarios automáticos y CI/CD con GitHub Actions.

### Fase 8: Autenticación Real y Seguridad (10 Feb 2026)
*   **Sistema de Usuarios:** Implementación de tabla `users` con contraseñas hasheadas (`bcryptjs`) y roles (`admin`, `user`).
*   **JWT:** Sustitución/Hibridación del sistema de API Key por tokens JWT (`jsonwebtoken`).
*   **UI de Acceso:**
    *   Modal de Login con opción de mostrar contraseña ("ojo") y cambio a modo Registro.
    *   Modal de Perfil de Usuario para cambio de contraseña.
    *   Botón de "Cerrar Sesión" e identificación visual del usuario activo.
*   **Auditoría Identificada:** Los logs de cambios ahora registran el ID del usuario que realizó la acción.

---

## 3. Estado Actual
El sistema cuenta con una arquitectura de seguridad profesional. Los usuarios pueden registrarse, iniciar sesión y gestionar su perfil. Todas las acciones quedan auditadas. El despliegue en Docker es estable bajo HTTPS.

---

## 4. Bitácora de RBAC y Funcionalidades (11 Feb 2026)

### Fase 9: Gestión de Usuarios y Roles (RBAC Completo) ✅
*   **Propiedad de Tareas:**
    *   Columna `created_by` añadida a tabla `issues`.
    *   Migración automática: Tareas huérfanas asignadas al admin (ID 1).
    *   Visualización del autor en Lista y Detalle (visible solo para admins).
*   **Seguridad y Permisos:**
    *   Usuarios normales solo ven y editan *sus* propias tareas.
    *   Administradores tienen acceso global (ver, editar, borrar todo).
    *   Endpoint `GET /users` y `PATCH /users/:id` protegidos para gestión de roles.
*   **Panel de Administración:**
    *   Nuevo botón "👥 Usuarios" en el header (visible solo para admins).
    *   Modal de gestión de usuarios:
        *   Listado de usuarios con fecha de registro y rol.
        *   Edición de rol (User <-> Admin).
        *   Cambio de contraseña de otros usuarios (reset administrativo).
        *   Eliminación de usuarios (con protección para no borrarse a uno mismo).

### Fase 10: Refinamiento y Tests ✅
*   **Tests Automatizados:**
    *   Creado `tests/auth.test.js` cubriendo flujos de RBAC y gestión de usuarios.
    *   Corregidos tests heredados (`api`, `files`, `logs`) para cumplir con las nuevas restricciones de FK y cabeceras CSV.
*   **Optimizaciones de UI/UX:**
    *   **Paginación de Usuarios:** Implementada en backend (`LIMIT/OFFSET`) y frontend (botones « » en modal de usuarios).
    *   **Feedback Visual en Mapa:** Los marcadores de tareas ajenas ahora tienen un borde distintivo (blanco/grueso) para administradores, facilitando la distinción de autoría de un vistazo.
    *   **Resiliencia:** El sistema ahora asegura la existencia de un usuario admin (ID 1) por defecto para evitar fallos de integridad en instalaciones nuevas o tests.

### Fase 11: Biblioteca de Planos Multi-usuario ✅

*   **Base de Datos:**

    *   Tabla `maps` creada para almacenar metadatos de planos (nombre, archivo, dueño).

    *   Columna `map_id` añadida a `issues` para vincular tareas a un plano específico.

    *   Migración automática: Mapa "Principal" por defecto creado y asignado a tareas existentes.

*   **Gestión de Mapas:**

    *   Nuevo módulo UI "🗺️ Planos" accesible desde el header.

    *   Funcionalidad para **subir nuevos planos** (imágenes) y **seleccionar el activo**.

    *   RBAC: Usuarios ven sus propios planos y los del sistema (admin); Admins ven todos.

*   **Integración en Mapa y Tareas:**

    *   El visor de mapa carga dinámicamente la imagen del plano seleccionado.

    *   Al crear una tarea, se asocia automáticamente al plano activo (`map_id`).

    *   El listado de tareas filtra visualmente las incidencias según el plano seleccionado.



### Fase 12: Refinamiento de Accesibilidad y UX ✅



*   **Formularios:** Añadidos atributos `autocomplete` (`username`, `current-password`, `new-password`) para compatibilidad con gestores de contraseñas.



*   **Accesibilidad ARIA:** Corregido conflicto de `aria-hidden` en modales para mejorar la navegación con lectores de pantalla.



*   **Estabilidad:** Migración de base de datos convertida a asíncrona para garantizar la integridad de las claves foráneas en el arranque y tests.







### Fase 13: Inversión de Control Lista-Mapa ✅



*   **Lista Global:** La lista de tareas ahora carga todas las incidencias del usuario (independientemente del plano activo).



*   **Cambio Automático de Plano:** Al seleccionar una tarea de la lista, la aplicación cambia automáticamente al plano (`map_id`) correspondiente y centra la vista en la tarea.



*   **Filtrado Visual del Mapa:** El mapa sigue filtrando visualmente los marcadores para mostrar solo los que pertenecen al plano que se está visualizando en ese momento.







---







## 5. Próximos Pasos

### Estabilidad y Despliegue
*   Revisar logs de producción para detectar posibles cuellos de botella en el polling de 30s.
*   Considerar el uso de WebSockets (Socket.io) en lugar de Polling si el número de usuarios crece.

### Fase 14: Gestión de Planos, Búsqueda Avanzada y Dashboard (12 Feb 2026) ✅

*   **Gestión de Planos en Edición:** Implementada la capacidad de reasignar una tarea a un plano diferente desde el modal de edición, incluyendo actualización en DB y logging.
*   **Búsqueda Avanzada por Usuario:** La barra de búsqueda global ahora permite filtrar tareas por el nombre de usuario del autor, integrando un `LEFT JOIN` en el backend.
*   **Dashboard de Estadísticas:**
    *   Integración de **Chart.js** para visualización dinámica.
    *   Gráficas de distribución por estado (Doughnut) y categoría (Bar) accesibles para todos.
    *   Gráfica de productividad por usuario (Top 5) exclusiva para administradores.
    *   Restauración de la funcionalidad de badges en tiempo real (Polling 30s) integrada en el nuevo módulo de estadísticas.

### Fase 15: Exportación Profesional de Estadísticas (14 Feb 2026) ✅

*   **Exportación a PNG con Fondo Sólido:** Implementado un plugin nativo de Chart.js para garantizar que los gráficos exportados tengan un fondo opaco (oscuro o claro según el tema), evitando que el texto blanco sea invisible.
*   **Informe PDF Completo:** Integración de `jsPDF` y `html2canvas` para generar informes PDF que incluyen títulos, fechas y todos los gráficos en un formato profesional.
*   **Sincronización de Entorno:** Resolución de inconsistencias entre el código local y el contenedor Docker, garantizando un despliegue limpio y funcional.

### Fase 16: Optimización Real y Arquitectura ARM64 (14 Feb 2026) ✅

*   **Compatibilidad Nativa ARM64:** Configuración explícita de `platform: linux/arm64` en `docker-compose.yml` para optimizar el rendimiento en sistemas Apple Silicon y similares.
*   **Robustez en Construcción:** Actualización del `Dockerfile` con herramientas de compilación (`python3`, `make`, `g++`) para asegurar que dependencias nativas como `sqlite3` y `sharp` se construyan correctamente bajo cualquier arquitectura.
*   **Flujo de Trabajo Flexible:** Ajuste de los hooks de Git (Husky) para permitir el desarrollo fluido en entornos con discrepancias de arquitectura entre el host y el contenedor, priorizando siempre la estabilidad del entorno de ejecución real (Docker).

### Fase 17: Revisión de Código, Seguridad y Refactorización (14 Feb 2026) ✅

*   **Unificación de Autenticación:** Se ha eliminado la función redundante `authenticateToken` en las rutas de autenticación, integrando el middleware centralizado `requireAuth()` en todo el backend para una mayor consistencia y facilidad de mantenimiento.
*   **Blindaje de Rutas:** Identificadas y corregidas vulnerabilidades de acceso en los endpoints de logs (`/v1/issues/:id/logs`) y categorías (`/v1/issues/categories`), que ahora requieren autenticación obligatoria.
*   **Robustez en Migraciones:** Refactorización de `src/db/sqlite.js` utilizando patrones `async/await`. Esto garantiza que la base de datos esté lista y sea coherente antes de que el servidor acepte conexiones, evitando fallos de integridad en el arranque.
*   **Seguridad de Administrador:** Implementado soporte para la variable de entorno `ADMIN_PASSWORD`. Ahora, el sistema puede inicializar o actualizar la contraseña del administrador por defecto (`admin`) de forma segura mediante un hash de `bcrypt`, eliminando el uso de credenciales bloqueadas o hardcodeadas.
*   **Limpieza de Código:** Eliminación de importaciones duplicadas, código muerto y mejora de la legibilidad general en los archivos críticos del núcleo (`sqlite.js`, `auth.routes.js`, `issues.routes.js`).

### Fase 18: Gestión de Comunicaciones y Notificaciones (14 Feb 2026) ✅

*   **Base de Datos Extendida:** Incorporación de la columna `email` (única y opcional) en la tabla `users` mediante una migración suave y segura.
*   **Flujo de Usuario Mejorado:** Actualización de los esquemas de registro y login para capturar y devolver el correo electrónico del usuario, integrándolo también en el payload del token JWT.
*   **Servicio de Notificaciones por Email:** Implementación de `src/services/mail.service.js` utilizando `nodemailer`. El servicio soporta configuración vía variables de entorno (`SMTP_HOST`, `SMTP_PORT`, etc.) y cuenta con un modo de depuración para desarrollo.
*   **Automatización de Avisos:**
    *   **Notificación al Administrador:** Envío automático de un correo al `ADMIN_EMAIL` cada vez que se registra una nueva incidencia en el sistema.
    *   **Aviso de Cambio de Estado:** Notificación inmediata al autor de una tarea cuando su estado cambia (ej. de "Abierta" a "En Proceso"), siempre que el usuario tenga un correo configurado.
*   **Resiliencia en Tests:** Corrección de la suite de pruebas automatizadas para reflejar el blindaje de rutas y asegurar que todos los flujos de comunicación funcionan bajo condiciones de carga real.

---

## 5. Próximos Pasos y Sugerencias de Funcionalidades

### Funcionalidades Pendientes de Desarrollar

*   **✉️ Gestión de Comunicaciones:**
    *   Incorporar el **email** en el registro de usuarios.
    *   Sistema de **notificaciones por correo** cuando una tarea cambia de estado o se asigna a un usuario.
*   **🔐 Seguridad y Recuperación:**
    *   Flujo de **recuperación de contraseña** mediante enlace enviado al email (Password Reset Tokens).
    *   Verificación de cuenta por correo electrónico tras el registro.
*   **💬 Interacción y Soporte:**
    *   Sistema de **comentarios** en cada tarea para permitir la comunicación entre técnicos y administradores.
    *   Botón de **contacto directo con el administrador** desde la interfaz de usuario.
*   **⚙️ Administración Avanzada:**
    *   Panel de configuración global para cambiar parámetros del sistema (ej. intervalos de polling, límites de subida) sin reiniciar el servidor.
    *   Posibilidad de **archivar planos** antiguos en lugar de eliminarlos para conservar el histórico.
*   **📱 Optimización Móvil:**
    *   Mejorar la respuesta táctil del mapa y la legibilidad de las gráficas en pantallas muy pequeñas.
*   **🔄 Actualización en Tiempo Real:**
    *   Migrar el polling actual a **WebSockets** (Socket.io) para recibir actualizaciones instantáneas de nuevas tareas o cambios de estado.

### Fase 19: Estabilidad Nuclear y Refinamiento de Perfil (14 Feb 2026) ✅

*   **Robustez Extrema en DB:**
    *   Refactorización de `src/db/sqlite.js` con apertura asíncrona real y configuración de `PRAGMA busy_timeout=5000`. Esto elimina los errores de "base de datos bloqueada" en entornos concurrentes.
    *   Activación forzada de modo `WAL` y `Foreign Keys` en cada apertura de conexión.
*   **Resolución de Rutas Inteligente:**
    *   Mejora en `src/config/paths.js` para detectar el entorno de ejecución. El sistema ahora ignora automáticamente rutas absolutas de Docker (`/app/...`) cuando detecta que se ejecuta en el host local, evitando fallos de arranque catastróficos.
*   **Sincronización de Entorno:**
    *   Unificación del archivo `.env` utilizando rutas relativas, garantizando compatibilidad total entre desarrollo local y despliegue en contenedores.
    *   Inclusión de `JWT_SECRET` persistente para evitar la invalidación de sesiones en reinicios.
*   **Experiencia de Usuario (Perfil):**
    *   **Flexibilidad en Actualización:** Ahora es posible cambiar el email sin necesidad de introducir la contraseña actual, solicitándola únicamente cuando se desea establecer una nueva clave.
    *   **Refinamiento de UI:** Actualización del modal de perfil con textos más claros ("Actualizar Perfil") y campos opcionales en el frontend para evitar confusiones.
*   **Corrección de Integración:** Resolución de errores de importación en `app.js` (`fetchJson`, `API_BASE`) que impedían el refresco dinámico de los datos del usuario tras cambios en el perfil.
