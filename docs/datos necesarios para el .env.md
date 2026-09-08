Aquí están **todos los datos necesarios para el `.env`** con explicaciones:

```bash
# ==========================================
# ENTORNO Y SERVIDOR
# ==========================================
NODE_ENV=development                    # development o production
HOST=0.0.0.0                           # Interfaz de escucha (0.0.0.0 para Docker)
PORT=3000                              # Puerto de la aplicación
PUBLIC_URL=https://localhost:8443      # URL pública (para enlaces de reset de contraseña)

# ==========================================
# AUTENTICACIÓN Y SEGURIDAD
# ==========================================
JWT_SECRET=tu_clave_secreta_jwt_muy_larga_y_segura
                                       # Clave para firmar tokens JWT (mín. 32 caracteres recomendado)

CSRF_SECRET=tu_clave_secreta_csrf_muy_larga
                                       # Clave para CSRF (si lo activas) (mín. 32 caracteres)
CSRF_ENABLED=0                         # Habilitar protección CSRF (0=desactivado, 1=activado)
CSRF_COOKIE_SECURE=0                   # Cookies CSRF secure (1=si, 0=no). 1 si tienes HTTPS

# ==========================================
# BASE DE DATOS
# ==========================================
DB_FILE=/app/data/data.db              # Ruta del archivo SQLite (en Docker)

# ==========================================
# ALMACENAMIENTO DE FICHEROS
# ==========================================
UPLOAD_DIR=/app/uploads                # Directorio de cargas (en Docker)

# ==========================================
# CORREO ELECTRÓNICO (SMTP)
# ==========================================
SMTP_HOST=mailpit                      # Host SMTP (mailpit en dev, tu servidor en prod)
SMTP_PORT=1025                         # Puerto SMTP (1025 para mailpit, 587 típico para prod)
SMTP_SECURE=false                      # Usar TLS (false para dev, true para prod en puerto 465)
SMTP_USER=                             # Usuario SMTP (opcional, vacío si no autenticación)
SMTP_PASS=                             # Contraseña SMTP (opcional, vacío si no autenticación)
SMTP_FROM="Gestor de Tareas" <no-reply@localhost>  # Remitente de correos

# ==========================================
# RATE LIMITING (OPCIONAL)
# ==========================================
RATE_LIMIT_ENABLED=0                   # Habilitar rate limiting (0=desactivado, 1=activado)
RATE_LIMIT_WINDOW_MS=60000             # Ventana de tiempo en ms (60000 = 1 minuto)
RATE_LIMIT_MAX=180                     # Máx. peticiones por ventana

# ==========================================
# SEGURIDAD ADICIONAL
# ==========================================
ALLOW_HTTP_IMAGES=false                # Permitir imágenes HTTP (false en prod, true si necesario)
TRUST_PROXY=1                          # Confiar en X-Forwarded-For (1 si hay Caddy/Nginx adelante)
FORCE_HTTPS=0                          # Forzar HTTPS (0 en dev, 1 en prod con Caddy)
HSTS_ENABLED=0                         # Habilitar HSTS (0 en dev, 1 en prod)
ALLOWED_ORIGINS=                       # Orígenes CORS permitidos (vacío para localhost en dev)

# ==========================================
# GRACEFUL SHUTDOWN
# ==========================================
SHUTDOWN_GRACE_MS=3000                 # Tiempo de gracia para cerrar (ms)
SHUTDOWN_FORCE_MS=6000                 # Tiempo fuerza cierre (ms)

# ==========================================
# LOGGING
# ==========================================
LOG_LEVEL=info                         # Nivel de log (debug, info, warn, error)
```

## **Mínimo recomendado para desarrollo:**

```bash
NODE_ENV=development
JWT_SECRET=dev-secret-key-muy-segura-32-caracteres-minimo
CSRF_SECRET=dev-csrf-secret-32-caracteres-minimo
SMTP_HOST=mailpit
SMTP_PORT=1025
PUBLIC_URL=https://localhost:8443
```

## **Producción (valores críticos):**

```bash
NODE_ENV=production
JWT_SECRET=<generar con: openssl rand -base64 32>
CSRF_SECRET=<generar con: openssl rand -base64 32>
CSRF_ENABLED=1
CSRF_COOKIE_SECURE=1
FORCE_HTTPS=1
HSTS_ENABLED=1
RATE_LIMIT_ENABLED=1
SMTP_HOST=<tu servidor SMTP real>
SMTP_PORT=587
SMTP_SECURE=true
SMTP_USER=<usuario SMTP>
SMTP_PASS=<contraseña SMTP>
PUBLIC_URL=https://tu-dominio.com
ALLOWED_ORIGINS=https://tu-dominio.com
```

## **Generar secretos seguros:**

```bash
# En macOS/Linux:
openssl rand -base64 32

# O con Node.js:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```