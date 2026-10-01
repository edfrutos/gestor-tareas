#!/usr/bin/env bash
# Exporta el .pkg firmado (Mac App Store) desde el .xcarchive de MAS.
# Requiere: Xcode CLT, un archive previo (make archive-mas), perfil de
# aprovisionamiento MAS instalado y ExportOptions-MAS.plist relleno
# (teamID + nombre exacto del provisioning profile).
#
# El .pkg resultante se sube a App Store Connect con Transporter (GUI) o:
#   xcrun altool --upload-app -f build/export-mas/GestorTareas.pkg \
#     -t macos --apiKey <KEY_ID> --apiIssuer <ISSUER_ID>
#
# Uso:
#   ./scripts/export_mas.sh                      # el archive MAS más reciente
#   ARCHIVE="/ruta/al.xcarchive" ./scripts/export_mas.sh
#
# `make archive-mas` guarda el archive en la carpeta de archivos de Xcode
# (la del Organizer), no en build/.
#
# Nota: con firma manual, `xcodebuild -exportArchive` de MAS ha fallado antes;
# la vía probada es el Organizer (Distribute App → App Store Connect).
set -euo pipefail

XCODE_ARCHIVES="$HOME/Library/Developer/Xcode/Archives"
if [[ -z "${ARCHIVE:-}" ]]; then
  ARCHIVE="$(ls -td "$XCODE_ARCHIVES"/*/"GestorTareas-MAS "*.xcarchive 2>/dev/null | head -1 || true)"
fi
EXPORT_DIR="build/export-mas"
EXPORT_PLIST="scripts/ExportOptions-MAS.plist"

if [[ -z "$ARCHIVE" || ! -d "$ARCHIVE" ]]; then
  echo "No encuentro ningún archive MAS${ARCHIVE:+ en $ARCHIVE}. Ejecuta primero: make archive-mas" >&2
  exit 1
fi
echo "==> Archive: $ARCHIVE"

echo "==> Exportando el .pkg firmado (Mac App Store)"
rm -rf "$EXPORT_DIR"
xcodebuild -exportArchive \
  -archivePath "$ARCHIVE" \
  -exportPath "$EXPORT_DIR" \
  -exportOptionsPlist "$EXPORT_PLIST"

echo "==> Listo: $EXPORT_DIR/GestorTareas.pkg"
echo "    Súbelo con Transporter.app o xcrun altool --upload-app."
