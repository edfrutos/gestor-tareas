import { state } from "./store.js";
import { $, catColor, statusLabel, safeText } from "./utils.js";

export function ensureMap() {
  if (state.map || typeof L === "undefined") return;
  const mapEl = $("#map");
  if (!mapEl) return;

  state.map = L.map(mapEl, {
    crs: L.CRS.Simple,
    minZoom: -1,
    maxZoom: 4,
    zoomControl: true
  });

  const bounds = [[0, 0], [1000, 1000]];
  const imageUrl = "/ui/plano.jpg"; 

  L.imageOverlay(imageUrl, bounds).addTo(state.map);
  state.map.fitBounds(bounds);

  state.markersLayer = L.layerGroup().addTo(state.map);

  state.map.on("click", (ev) => {
    if (!ev || !ev.latlng) return;
    setLatLng(ev.latlng.lat, ev.latlng.lng, { pan: false, setPin: true });
  });
}

export function clearMarkers() {
  if (state.markersLayer) state.markersLayer.clearLayers();
}

export function addMarkers(items, onClickMarker) {
  ensureMap();
  if (!state.markersLayer || !Array.isArray(items)) return;

  items.forEach((it) => {
    if (!it || it.lat == null || it.lng == null) return;
    const lat = Number(it.lat);
    const lng = Number(it.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    // TODO: Importar catColor de utils.js si queremos colores dinámicos
    // Para simplificar, usaremos un color default o importaremos catColor
    // Como map.js es "bajo nivel", mejor que el color venga o se calcule fuera, o importar utils.
    // Importaré catColor dinámicamente si es necesario, o asumo que el caller configura el estilo?
    // Mejor importo catColor de utils.js
    
    const m = L.circleMarker([lat, lng], { radius: 7, weight: 2, opacity: 0.9, fillOpacity: 0.6 });
    m.setStyle({ color: catColor(it.category), fillColor: catColor(it.category) });

    const title = safeText(it.title);
    const cat = safeText(it.category);
    const st = safeText(statusLabel(it.status));
    m.bindPopup(`<strong>${title}</strong><br>${cat} · ${st}`);
    
    m.on("click", () => onClickMarker(it));
    state.markersLayer.addLayer(m);
  });
}

export function setLatLng(lat, lng, { pan = true, setPin = true } = {}) {
  const la = Number(lat);
  const ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return;

  const elLat = $("#lat");
  const elLng = $("#lng");
  if (elLat) elLat.value = String(la);
  if (elLng) elLng.value = String(ln);

  ensureMap();

  if (setPin && state.map) {
    if (!state.markerPin) {
      state.markerPin = L.marker([la, ln], { draggable: true }).addTo(state.map);
      state.markerPin.on("dragend", () => {
        const p = state.markerPin.getLatLng();
        setLatLng(p.lat, p.lng, { pan: false, setPin: false });
      });
    } else {
      state.markerPin.setLatLng([la, ln]);
    }
  }

  if (pan && state.map) state.map.setView([la, ln], Math.max(state.map.getZoom(), 1));
}
