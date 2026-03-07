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