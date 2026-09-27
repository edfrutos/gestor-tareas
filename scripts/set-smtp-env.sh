#!/usr/bin/env bash
# Configura (o rota) las credenciales SMTP en el .env de producción sin que la
# clave pase por el portapapeles, el chat ni el historial de la shell.
#
# Uso (en el servidor):   sudo bash set-smtp-env.sh [/ruta/al/.env]
#
# El .env de producción se carga con `docker run --env-file`, que NO quita
# comillas ni comentarios: los valores se escriben "limpios", sin comillas.
# No recrea el contenedor: eso se hace después con el `docker run` verificado.
set -euo pipefail

ENV_FILE="${1:-/opt/gestor-tareas/.env}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "No existe $ENV_FILE" >&2
  exit 1
fi
if [[ ! -w "$ENV_FILE" ]]; then
  echo "Sin permiso de escritura en $ENV_FILE (¿falta sudo?)" >&2
  exit 1
fi

read -r -p "SMTP_HOST [smtp-relay.brevo.com]: " SMTP_HOST
SMTP_HOST="${SMTP_HOST:-smtp-relay.brevo.com}"
read -r -p "SMTP_PORT [587]: " SMTP_PORT
SMTP_PORT="${SMTP_PORT:-587}"
read -r -p "SMTP_USER (login SMTP de Brevo, xxxx@smtp-brevo.com): " SMTP_USER
read -r -s -p "SMTP_PASS (no se muestra): " SMTP_PASS
echo
read -r -p "SMTP_FROM [Gestor de Tareas <no-reply@gtareas.edefrutos2020.com>]: " SMTP_FROM
SMTP_FROM="${SMTP_FROM:-Gestor de Tareas <no-reply@gtareas.edefrutos2020.com>}"

for v in SMTP_HOST SMTP_PORT SMTP_USER SMTP_PASS SMTP_FROM; do
  if [[ -z "${!v}" ]]; then
    echo "$v no puede estar vacío" >&2
    exit 1
  fi
  if [[ "${!v}" == *$'\n'* ]]; then
    echo "$v no puede contener saltos de línea" >&2
    exit 1
  fi
done
if [[ ! "$SMTP_PORT" =~ ^[0-9]+$ ]]; then
  echo "SMTP_PORT debe ser un número" >&2
  exit 1
fi

BACKUP="${ENV_FILE}.bak-$(date +%Y%m%d-%H%M%S)"
cp -p "$ENV_FILE" "$BACKUP"
chmod 600 "$BACKUP"

# Reescribe el fichero sin las claves SMTP_* antiguas y las añade al final.
# Los valores se pasan por el entorno (no por la línea de comandos), así la
# clave no aparece en `ps`.
TMP="$(mktemp "${ENV_FILE}.tmp.XXXXXX")"
grep -Ev '^(SMTP_HOST|SMTP_PORT|SMTP_SECURE|SMTP_USER|SMTP_PASS|SMTP_FROM)=' "$ENV_FILE" > "$TMP" || true
{
  printf 'SMTP_HOST=%s\n' "$SMTP_HOST"
  printf 'SMTP_PORT=%s\n' "$SMTP_PORT"
  printf 'SMTP_USER=%s\n' "$SMTP_USER"
  printf 'SMTP_PASS=%s\n' "$SMTP_PASS"
  printf 'SMTP_FROM=%s\n' "$SMTP_FROM"
} >> "$TMP"
chmod --reference="$ENV_FILE" "$TMP"
chown --reference="$ENV_FILE" "$TMP"
mv "$TMP" "$ENV_FILE"
unset SMTP_PASS

echo
echo "Actualizado $ENV_FILE (copia previa: $BACKUP)"
grep -E '^SMTP_' "$ENV_FILE" | sed -E 's/^(SMTP_PASS=).*/\1********/'
echo
echo "Siguiente paso: recrear el contenedor con el 'docker run' verificado (el .env solo se lee al crearlo)."
