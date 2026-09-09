#!/usr/bin/env bash
# Firma (Developer ID) + notarización + staple de la app fuera de la App Store.
# Requiere: Xcode CLT, un archive previo (make archive-devid) y un perfil de
# notarización guardado en el llavero.
#
# Alta única del perfil de credenciales (una sola vez por máquina):
#   xcrun notarytool store-credentials "gestor-tareas-notary" \
#     --apple-id "TU_APPLE_ID" --team-id "TU_TEAM_ID" \
#     --password "CONTRASEÑA_ESPECIFICA_DE_APP"
#
# Uso:
#   ./scripts/notarize.sh
set -euo pipefail

KEYCHAIN_PROFILE="${KEYCHAIN_PROFILE:-gestor-tareas-notary}"
ARCHIVE="build/GestorTareas-DevID.xcarchive"
EXPORT_DIR="build/export-devid"
APP_NAME="GestorTareas.app"
DMG_PATH="build/GestorTareas.dmg"
EXPORT_PLIST="scripts/ExportOptions-DevID.plist"

if [[ ! -d "$ARCHIVE" ]]; then
  echo "No existe $ARCHIVE. Ejecuta primero: make archive-devid" >&2
  exit 1
fi

echo "==> Exportando la app firmada (Developer ID)"
rm -rf "$EXPORT_DIR"
xcodebuild -exportArchive \
  -archivePath "$ARCHIVE" \
  -exportPath "$EXPORT_DIR" \
  -exportOptionsPlist "$EXPORT_PLIST"

APP_PATH="$EXPORT_DIR/$APP_NAME"

echo "==> Creando DMG"
rm -f "$DMG_PATH"
hdiutil create -volname "Gestor de Tareas" \
  -srcfolder "$APP_PATH" -ov -format UDZO "$DMG_PATH"

echo "==> Enviando a notarizar (puede tardar unos minutos)"
xcrun notarytool submit "$DMG_PATH" \
  --keychain-profile "$KEYCHAIN_PROFILE" \
  --wait

echo "==> Grapando el ticket"
xcrun stapler staple "$DMG_PATH"
xcrun stapler validate "$DMG_PATH"

echo "==> Listo: $DMG_PATH"
