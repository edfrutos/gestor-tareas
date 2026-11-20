# Guía de Operaciones y Mantenimiento

## Despliegue y Ejecución

### Levantar el entorno (Limpio)
Para reconstruir y levantar los servicios asegurando que no queden contenedores huérfanos:

```bash
# 1. Asegúrate de estar en la raíz del proyecto
ls -la docker-compose.yml

# 2. Limpieza de contenedores previos
docker compose -f docker-compose.yml -f docker-compose.caddy.yml down --remove-orphans

# 3. Construir y levantar (--profile local-https para Caddy/HTTPS)
docker compose -f docker-compose.yml -f docker-compose.caddy.yml --profile local-https up -d --build --force-recreate

# 4. Verificar estado
docker compose -f docker-compose.yml -f docker-compose.caddy.yml ps
```

### Ver Logs
```bash
docker compose -f docker-compose.yml -f docker-compose.caddy.yml logs --tail=100 -f gestor-tareas
docker compose -f docker-compose.yml -f docker-compose.caddy.yml logs --tail=100 -f caddy
```

## Despliegue en producción (`edf-developer`)

Producción corre en el servidor **`edf-developer`** (OVHcloud) como un contenedor Docker suelto
(sin `docker compose`), detrás del proxy del servidor, que publica `https://gtareas.efjdev.com`.

| Elemento | Valor |
| --- | --- |
| Contenedor | `gestor-tareas` |
| Imagen | `edefrutos/gestor-tareas:sha-<commit>` (Docker Hub: cuenta **`edefrutos`**, no `edfrutos`) |
| Puerto | `127.0.0.1:8090` en el host → `3000` en el contenedor |
| Entorno | `--env-file /opt/gestor-tareas/.env` (la app no usa `dotenv`) |
| Datos | `/opt/gestor-tareas/{data,uploads,backups}` montados en `/app/...`, propiedad de `10001:10001` |

GitHub Actions (`Docker Build & Push`) publica una imagen `sha-<7 caracteres del commit>` por cada
merge a `main`. Se despliega siempre una etiqueta `sha-…` concreta, no `latest`, para saber qué
versión hay en producción y poder volver atrás.

### Procedimiento (como root en el servidor, nunca desde el Mac)

```bash
# 0. Comprobar el .env sin mostrar secretos. Si no sale nada, PARAR.
grep -E '^(PUBLIC_URL|DB_FILE|SMTP_HOST)=' /opt/gestor-tareas/.env

# 1. Guardar la imagen en uso para poder volver atrás
docker tag "$(docker inspect gestor-tareas --format '{{.Image}}')" gestor-tareas:pre-deploy

# 2. Descargar la nueva y sustituir el contenedor
docker pull edefrutos/gestor-tareas:sha-<commit>
docker stop gestor-tareas && docker rm gestor-tareas
docker run -d \
  --name gestor-tareas \
  --restart unless-stopped \
  -p 127.0.0.1:8090:3000 \
  --env-file /opt/gestor-tareas/.env \
  -v /opt/gestor-tareas/data:/app/data \
  -v /opt/gestor-tareas/uploads:/app/uploads \
  -v /opt/gestor-tareas/backups:/app/backups \
  edefrutos/gestor-tareas:sha-<commit>

# 3. Comprobar
sleep 3; docker logs --tail 20 gestor-tareas      # debe salir "listening on HTTP"
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8090/health   # 200
```

**Vuelta atrás:** `docker stop gestor-tareas && docker rm gestor-tareas` y repetir el `docker run`
con la imagen `gestor-tareas:pre-deploy`. Cuando la versión nueva lleve unos días estable:
`docker rmi gestor-tareas:pre-deploy`.

### Precauciones

- **Nunca pegar la salida completa de `docker inspect gestor-tareas`** en chats, issues o PR:
  incluye el entorno (`JWT_SECRET`, `SMTP_PASS`…) en claro. Para ver la imagen y los montajes:
  `docker inspect gestor-tareas --format '{{.Config.Image}} {{json .HostConfig.Binds}}'`.
- Si un secreto se expone: la clave SMTP se cambia en Brevo (SMTP y API → claves SMTP), se
  actualiza en `/opt/gestor-tareas/.env`, se borra la antigua y se recrea el contenedor. Cambiar
  `JWT_SECRET` invalida todas las sesiones (los usuarios tendrán que volver a entrar).
- Comprobar en el servidor (`docker inspect`, `~/.bash_history`) antes de reconstruir comandos:
  no fiarse de la memoria.

### Páginas públicas

Privacidad y soporte viven en **efjdev.com** (WordPress), no en este servidor. El backend redirige
con un 301 (`src/app.js`, `PUBLIC_PAGE_REDIRECTS`):

| Ruta en `gtareas.efjdev.com` | Destino |
| --- | --- |
| `/privacy.html`, `/privacy` | `https://efjdev.com/privacidad/#gestortareas` |
| `/support.html`, `/support` | `https://efjdev.com/soporte/#gestortareas` |

`gtareas.efjdev.com` no se puede retirar: sirve la API y la web, y la app de macOS lo usa como
servidor por defecto (`AppSettings.fallbackURLString`).

## Mantenimiento de Base de Datos y Archivos

Los scripts de mantenimiento se encuentran en `src/scripts/` dentro del contenedor.

### 1. Auditoría de Datos vs Archivos
Comprueba inconsistencias entre la base de datos y los archivos en disco (fotos faltantes, huérfanos).

```bash
docker compose --profile local-https -f docker-compose.yml -f docker-compose.caddy.yml \
exec gestor-tareas sh -lc 'node src/scripts/db-audit.js'
```

### 2. Reparación de Base de Datos (`db-repair`)
Intenta corregir rutas de imágenes rotas y normalizar URLs.

**Modo Dry-Run (Simulacro):**
```bash
docker compose --profile local-https -f docker-compose.yml -f docker-compose.caddy.yml \
exec gestor-tareas sh -lc 'node src/scripts/db-repair.js'
```

**Aplicar Cambios:**
```bash
docker compose --profile local-https -f docker-compose.yml -f docker-compose.caddy.yml \
exec gestor-tareas sh -lc 'DRY_RUN=0 node src/scripts/db-repair.js'
```

### 3. Limpieza de Archivos Huérfanos (`uploads-prune`)
Elimina archivos en `uploads/` que no están referenciados en la base de datos.

**Modo Dry-Run (Ver qué se borraría):**
```bash
docker compose --profile local-https -f docker-compose.yml -f docker-compose.caddy.yml \
exec gestor-tareas sh -lc 'node src/scripts/uploads-prune.js'
```

**Borrar Archivos (Con precaución):**
```bash
docker compose --profile local-https -f docker-compose.yml -f docker-compose.caddy.yml \
exec gestor-tareas sh -lc 'PRUNE=1 MAX_DELETE=200 node src/scripts/uploads-prune.js'
```

## Troubleshooting

### El puerto 8443 está ocupado o no responde
1.  Verificar si algo escucha en el puerto:
    ```bash
    lsof -nP -iTCP:8443 -sTCP:LISTEN
    ```
2.  Si no devuelve nada, Caddy no está corriendo. Verificar logs:
    ```bash
    docker compose -f docker-compose.yml -f docker-compose.caddy.yml logs caddy
    ```
3.  Probar conexión local (ignorando certificado SSL):
    ```bash
    curl -kI https://localhost:8443/
    ```

### Docker no responde
Verificar si el daemon de Docker está activo:
```bash
docker info
```
Si falla, reiniciar Docker Desktop.

```