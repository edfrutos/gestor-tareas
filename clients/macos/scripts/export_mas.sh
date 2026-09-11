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
#   ./scripts/export_mas.sh
set -euo pipefail

ARCHIVE="build/GestorTareas-MAS.xcarchive"
EXPORT_DIR="build/export-mas"
EXPORT_PLIST="scripts/ExportOptions-MAS.plist"

if [[ ! -d "$ARCHIVE" ]]; then
  echo "No existe $ARCHIVE. Ejecuta primero: make archive-mas" >&2
  exit 1
fi

echo "==> Exportando el .pkg firmado (Mac App Store)"
rm -rf "$EXPORT_DIR"
xcodebuild -exportArchive \
  -archivePath "$ARCHIVE" \
  -exportPath "$EXPORT_DIR" \
  -exportOptionsPlist "$EXPORT_PLIST"

echo "==> Listo: $EXPORT_DIR/GestorTareas.pkg"
echo "    Súbelo con Transporter.app o xcrun altool --upload-app."
