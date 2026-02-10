# Notebook de Seguimiento - Gestor de Tareas

**Fecha:** 10 de Febrero de 2026
**Contexto:** Intervención técnica sobre repositorio `gestor-tareas`.

## 1. Estado Inicial
Al tomar el proyecto, la aplicación presentaba una arquitectura funcional basada en Node.js (Express), SQLite y Docker (con Caddy como proxy), pero sufría de varios problemas críticos de estabilidad y funcionalidad reportados:

*   **Bloqueo Crítico:** No se podían crear tareas con archivos adjuntos.
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
*   **Edición Avanzada:** Se ha implementado la capacidad de cambiar la **Categoría** de una tarea desde el modal de edición, con actualización dinámica del historial y de los filtros globales.
*   **Cache-Busting Agresivo:** Renombrado del módulo `details.js` a `details.v2.js` para forzar la actualización en los navegadores de los usuarios.
*   **Infraestructura:** Backups diarios automáticos y CI/CD con GitHub Actions.

---

## 3. Estado Actual
Sistema robusto, auditable y con despliegue automatizado. El entorno Docker es ahora plenamente funcional bajo HTTPS (Caddy) y el código está libre de bugs críticos.

---

## 4. Próximos Pasos: Autenticación Real 🔐

### Objetivo
Sustituir el sistema actual de API Key compartida por un sistema de **Usuarios y Sesiones** robusto.

### Plan Técnico
1.  **Modelo de Datos:** Crear tabla `users` (id, username, password_hash, role, created_at).
2.  **Backend Auth:**
    *   Librería `bcrypt` para el hash de contraseñas.
    *   Librería `jsonwebtoken` (JWT) para la gestión de tokens.
    *   Nuevos endpoints: `POST /v1/auth/login`, `POST /v1/auth/me`.
3.  **Integración:**
    *   Modificar `issue_logs` para registrar el `user_id` de quien realiza el cambio.
    *   Actualizar middleware de seguridad para validar el JWT en lugar de la API Key.
4.  **Frontend:**
    *   Modal de Login al iniciar la aplicación.
    *   Gestión del token en el módulo `api.js`.
    *   Visualización del nombre de usuario en la barra superior.