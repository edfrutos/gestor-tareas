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

---



## 5. Próximos Pasos



### Refinamiento de UX (Prioridad)

*   **Inversión de Control Lista-Mapa:**

    *   Actualmente, el mapa filtra la lista de tareas.

    *   **Cambio solicitado:** La lista debe mostrar *todas* las tareas del usuario (independientemente del mapa activo).

    *   Al seleccionar una tarea de la lista, si esta pertenece a un plano distinto al activo, la aplicación debe cambiar automáticamente al plano correspondiente (`map_id`) y centrar la vista en la tarea.



### Estabilidad y Despliegue

*   Revisar logs de producción para detectar posibles cuellos de botella en el polling de 30s.

*   Considerar el uso de WebSockets (Socket.io) en lugar de Polling si el número de usuarios crece.



### Funcionalidades Pendientes

*   **Búsqueda avanzada** por nombre de usuario en la lista de incidencias (solo para admins).

*   **Dashboard de estadísticas gráficas** (usando Chart.js o similar) en el panel de administración.
