# Runbook: Recuperación ante SQLITE_CORRUPT

Este documento describe el procedimiento para detectar, alertar y recuperar incidentes de corrupción en `data/data.db` (SQLITE_CORRUPT).

## 1. Causas Raíz y Verificaciones

Antes de recuperar, conviene investigar la causa para evitar repetición:

### 1.1 Almacenamiento y Hardware

- **SSD/Disco**: Verificar salud con `smartctl` (si disponible).
- **Docker volumes**: Si usas volúmenes, comprobar que no haya problemas de sincronización.
- **Montajes NFS/red**: Evitar montar la BD en sistemas de archivos de red.

### 1.2 Sistema de Archivos

```bash
# Verificar errores en el sistema de archivos
dmesg | grep -i error
# En macOS: diskutil verifyVolume /
```

### 1.3 Contenedor Docker

- **Volúmenes**: Usar bind mounts (`./data:/app/data`) en lugar de volúmenes anónimos.
- **Reinicios abruptos**: Asegurar `docker stop` con timeout adecuado para que la app cierre la BD correctamente.

## 2. Configuración SQLite (Mitigación)

La aplicación ya aplica:

- `PRAGMA journal_mode=WAL`
- `PRAGMA synchronous=FULL`
- `PRAGMA busy_timeout=5000`
- Cierre ordenado en SIGTERM/SIGINT

## 3. Monitoreo y Detección

- **Integrity check periódico**: Cada 6h (configurable con `DB_INTEGRITY_INTERVAL_MS`).
- **Endpoint**: `/health` incluye `dbIntegrity` con `ok`, `result` y `lastCheck`.
- **Logs**: Si falla `integrity_check`, se registra en consola.

## 4. Procedimiento de Recuperación (.recover)

### 4.1 Detener la aplicación

```bash
# Docker
docker stop <container_id>

# O con docker-compose
docker-compose down
```

### 4.2 Ejecutar recuperación

```bash
# Con sqlite3 CLI (recomendado)
node src/scripts/db-recover.js

# Dry-run (ver qué haría)
node src/scripts/db-recover.js --dry-run

# En Docker
docker run --rm -v $(pwd)/data:/app/data -v $(pwd)/backups:/app/backups \
  <image> node src/scripts/db-recover.js
```

### 4.3 Verificación post-recuperación

```bash
sqlite3 data/data.db "PRAGMA integrity_check;"
# Debe devolver: ok
```

### 4.4 Reiniciar

```bash
docker-compose up -d
```

## 5. Restauración desde Backup

Si la recuperación no es suficiente:

```bash
RESTORE=1 BACKUP_DB=db-YYYY-MM-DDTHH-MM-SS.sqlite node src/scripts/backup-restore.js
```

## 6. Drills de Recuperación

Ejecutar periódicamente para validar el procedimiento:

1. Crear backup de prueba: `npm run backup`
2. Simular corrupción (solo en entorno de pruebas): `echo "corrupt" >> data/data.db`
3. Ejecutar `db-recover.js` o restaurar desde backup
4. Verificar que la app arranca y los datos son accesibles

## 7. Referencias

- [SQLite Backup API](https://www.sqlite.org/backup.html)
- [SQLite .recover](https://www.sqlite.org/cli.html#recover)
- [PRAGMA integrity_check](https://www.sqlite.org/pragma.html#pragma_integrity_check)
