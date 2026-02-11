import { state } from "./store.js";
import { getUser } from "./auth.js";
import { $, catColor, statusLabel, safeText } from "./utils.js";

// Inicializar módulo: listeners
export function initMapModule() {
  document.addEventListener("mapChanged", (e) => {
    const mapData = e.detail;
    if (mapData && state.map) {
      updateMapImage(mapData.file_url);
    }
  });
}

// Inicializar Geo (placeholder si no existía)
export function initGeoModule() {
  // Lógica de geolocalización si es necesaria
}

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
  
  // Imagen inicial (fallback o state.currentMap)
  const imageUrl = state.currentMap ? state.currentMap.file_url : "/ui/plano.jpg";

  state.mapOverlay = L.imageOverlay(imageUrl, bounds).addTo(state.map);
  state.map.fitBounds(bounds);

  state.markersLayer = L.layerGroup().addTo(state.map);

  state.map.on("click", (ev) => {
    if (!ev || !ev.latlng) return;
    setLatLng(ev.latlng.lat, ev.latlng.lng, { pan: false, setPin: true });
  });
}

export function updateMapImage(url) {
  if (!state.map || !state.mapOverlay) {
    console.warn("Map not ready for image update");
    return;
  }
  state.mapOverlay.setUrl(url);
}

export function clearMarkers() {
  if (state.markersLayer) state.markersLayer.clearLayers();
  // También limpiar el pin de "nueva tarea" si se desea
  if (state.markerPin) {
    state.markerPin.remove();
    state.markerPin = null;
  }
}

export function addMarkers(items, onClickMarker) {
  ensureMap();
  if (!state.markersLayer || !Array.isArray(items)) return;

  const currentUser = getUser();

  items.forEach((it) => {
    if (!it || it.lat == null || it.lng == null) return;
    const lat = Number(it.lat);
    const lng = Number(it.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    // Solo mostrar marcadores del mapa actual (si se desea filtrar visualmente)
    // OJO: La API ya debería filtrar las issues por mapa, pero por seguridad visual:
    // if (state.currentMap && it.map_id !== state.currentMap.id) return; 
    // (Asumimos que loadIssues ya filtra por map_id si implementamos el filtro en backend)

    const isMine = currentUser && it.created_by === currentUser.id;
    const color = catColor(it.category);
    
    const m = L.circleMarker([lat, lng], { 
      radius: 7, 
      weight: isMine ? 2 : 4,
      opacity: 0.9, 
      fillOpacity: 0.6,
      color: isMine ? color : "#ffffff",
      fillColor: color 
    });

    const title = safeText(it.title);
    const cat = safeText(it.category);
    const st = safeText(statusLabel(it.status));
    const author = it.created_by_username ? `<br><small>👤 ${safeText(it.created_by_username)}</small>` : '';
    m.bindPopup(`<strong>${title}</strong><br>${cat} · ${st}${author}`);
    
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