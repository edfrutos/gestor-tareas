#!/usr/bin/env bash
# capturas-applstore.sh — captura la ventana de GestorTareas a
# 2880×1800 px (16:10) para la ficha de la Mac App Store.
#
# Redimensiona la ventana a 1440×900 puntos y captura ese rectángulo. En una
# pantalla Retina salen 2880×1800 px; en una no Retina, 1440×900 px (también
# válido para App Store Connect).
#
# USO:
#   scripts/capturas-applstore.sh <nombre>   # → ~/Desktop/appstore-<nombre>.png
#   scripts/capturas-applstore.sh --sin-redimensionar <nombre>
#
# Con --sin-redimensionar no mueve ni redimensiona nada: busca la ventana de
# la app que ya mide 1440×900 y captura su rectángulo con todo lo que haya
# encima. Sirve para el panel de guardar, que bajo sandbox es otra ventana y,
# sin esta opción, sería la que se redimensiona. Haz antes una captura normal
# para dejar la ventana en 1440×900 y después abre el panel.
#
# Requisitos:
#   - La app abierta (proceso «GestorTareas»).
#   - Permiso de Accesibilidad para Terminal (Ajustes del Sistema →
#     Privacidad y seguridad → Accesibilidad), para mover la ventana.
#   - Permiso de Grabación de pantalla para Terminal, para capturar.
#   - Una pantalla de al menos 1440×900 puntos libres bajo la barra de menús
#     (p. ej., «Más espacio» en un portátil).
set -euo pipefail

RESIZE=1
if [[ "${1:-}" == "--sin-redimensionar" ]]; then
	RESIZE=0
	shift
fi
NAME="${1:?Uso: $0 [--sin-redimensionar] <nombre>   (p. ej. 1-articulo)}"
PROCESS="${PROCESS:-GestorTareas}"
WIDTH=1440
HEIGHT=900
OUT="${HOME}/Desktop/appstore-${NAME}.png"

if ((RESIZE)); then
	geometry="$(osascript <<OSA
tell application "System Events" to tell process "${PROCESS}"
	set frontmost to true
	set position of front window to {0, 0}
	set size of front window to {${WIDTH}, ${HEIGHT}}
	delay 0.5
	set {x, y} to position of front window
	set {w, h} to size of front window
	return (x as text) & "," & (y as text) & "," & (w as text) & "," & (h as text)
end tell
OSA
	)"
else
	geometry="$(osascript <<OSA
tell application "System Events" to tell process "${PROCESS}"
	repeat with win in windows
		set {w, h} to size of win
		if w is ${WIDTH} and h is ${HEIGHT} then
			set {x, y} to position of win
			return (x as text) & "," & (y as text) & "," & (w as text) & "," & (h as text)
		end if
	end repeat
	return ""
end tell
OSA
	)"
	if [[ -z "${geometry}" ]]; then
		echo "Error: ninguna ventana de ${PROCESS} mide ${WIDTH}×${HEIGHT} puntos." >&2
		echo "Cierra el panel, haz una captura normal para dejar la ventana a" >&2
		echo "esa medida y vuelve a abrir el panel." >&2
		exit 1
	fi
fi
IFS=, read -r x y w h <<<"${geometry}"

if ((w != WIDTH || h != HEIGHT)); then
	echo "Error: la ventana ha quedado en ${w}×${h} puntos, no ${WIDTH}×${HEIGHT}." >&2
	echo "La pantalla es demasiado pequeña: elige «Más espacio» en Ajustes del" >&2
	echo "Sistema → Pantallas, o usa un monitor externo." >&2
	exit 1
fi

# Deja que la app termine de redibujar tras el cambio de tamaño.
sleep 1
screencapture -x -R"${x},${y},${w},${h}" "${OUT}"

px_w="$(sips -g pixelWidth "${OUT}" | awk '/pixelWidth/ {print $2}')"
px_h="$(sips -g pixelHeight "${OUT}" | awk '/pixelHeight/ {print $2}')"
echo "Captura: ${OUT} (${px_w}×${px_h} px)"
case "${px_w}x${px_h}" in
2880x1800 | 1440x900) ;;
*)
	echo "Aviso: ${px_w}×${px_h} no es un tamaño que acepte App Store Connect." >&2
	exit 1
	;;
esac
