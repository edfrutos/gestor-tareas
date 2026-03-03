import { state } from "./store.js";
import { getUser } from "./auth.js";
import { $, catColor, statusLabel, safeText, toast } from "./utils.js";
import { fetchJson } from "./api.js";

// Fuente única de verdad para detección móvil (usado en ensureMap y addMarkers)
function getIsMobile() {
  return window.innerWidth < 600;
}

let lastIsMobile = null;

function defaultOnClickMarker(it) {
  import("./details.v2.js").then((m) => m.openDetailModal(it));
}

function handleResizeOrOrientation() {
  const now = getIsMobile();
  if (lastIsMobile === now) return;
  lastIsMobile = now;

  if (!state.map || !state.zoomControl) return;

  state.map.removeControl(state.zoomControl);
  state.zoomControl = L.control.zoom({
    position: now ? "bottomright" : "topright"
  }).addTo(state.map);

  clearMarkers();
  const allIssues = Array.from(state.allItemsById.values());
  addMarkers(allIssues, defaultOnClickMarker);
}

// Inicializar módulo: listeners
export function initMapModule() {
  let resizeDebounce;
  window.addEventListener("resize", () => {
    clearTimeout(resizeDebounce);
    resizeDebounce = setTimeout(handleResizeOrOrientation, 150);
  });
  window.addEventListener("orientationchange", () => {
    clearTimeout(resizeDebounce);
    resizeDebounce = setTimeout(handleResizeOrOrientation, 300);
  });

  document.addEventListener("mapChanged", (e) => {
    const mapData = e.detail;
    if (mapData && state.map) {
      updateMapImage(mapData.file_url);

      // Al cambiar de plano, refrescar marcadores visibles usando la caché
      const allIssues = Array.from(state.allItemsById.values());
      clearMarkers();
      addMarkers(allIssues, defaultOnClickMarker);
      
      // Cargar zonas del nuevo plano
      loadZones(mapData.id);
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

  const isMobile = getIsMobile();
  lastIsMobile = isMobile;

  state.map = L.map(mapEl, {
    crs: L.CRS.Simple,
    minZoom: -1,
    maxZoom: 4,
    zoomControl: false, 
    doubleClickZoom: false, // Desactivar para evitar zoom accidental al marcar
    tap: !L.Browser.touch, // Usar tap nativo si no es táctil, para evitar conflictos
    touchZoom: true,
    dragging: true,
    bounceAtZoomLimits: true
  });

  // Controles de zoom: Arriba-Derecha en Desktop, Abajo-Derecha en Móvil para no estorbar
  state.zoomControl = L.control.zoom({
    position: isMobile ? "bottomright" : "topright"
  }).addTo(state.map);

  const bounds = [[0, 0], [1000, 1000]];
  
  // Imagen inicial (fallback o state.currentMap)
  const imageUrl = state.currentMap ? state.currentMap.file_url : "/ui/plano.jpg";

  state.mapOverlay = L.imageOverlay(imageUrl, bounds).addTo(state.map);
  state.map.fitBounds(bounds);

  state.markersLayer = L.layerGroup().addTo(state.map);

  state.map.on("click", (ev) => {
    // Si el control de dibujo está activo, no poner pin de tarea
    if (state.isDrawing) return;
    if (!ev || !ev.latlng) return;
    setLatLng(ev.latlng.lat, ev.latlng.lng, { pan: false, setPin: true });
  });

  // --- DIBUJO DE ZONAS (Fase 35) ---
  if (state.zonesLayer) state.map.removeLayer(state.zonesLayer);
  state.zonesLayer = L.featureGroup().addTo(state.map);
  
  const drawControl = new L.Control.Draw({
    draw: {
      polyline: false,
      marker: false,
      circlemarker: false,
      circle: false,
      rectangle: { shapeOptions: { color: '#7c5cff', weight: 3, fillOpacity: 0.2 } },
      polygon: {
        allowIntersection: false,
        showArea: true,
        drawError: { color: '#e1e100', message: '<strong>¡No puedes cruzar líneas!</strong>' },
        shapeOptions: { color: '#7c5cff', weight: 3, fillOpacity: 0.2 }
      }
    },
    edit: {
      featureGroup: state.zonesLayer,
      remove: true
    }
  });

  if (getUser()) {
    state.map.addControl(drawControl);
    
    state.map.on(L.Draw.Event.DRAWSTART, () => { state.isDrawing = true; });
    state.map.on(L.Draw.Event.DRAWSTOP, () => { state.isDrawing = false; });

    state.map.on(L.Draw.Event.CREATED, async (e) => {
      if (!state.currentMap) {
        toast("❌ Debes seleccionar un plano primero", "error");
        return;
      }

      const layer = e.layer;
      const type = e.layerType;
      
      const name = prompt("Nombre de la zona (ej: Almacén, Pasillo B):", "Nueva Zona");
      if (!name) return;

      try {
        const geojson = JSON.stringify(layer.toGeoJSON());
        const res = await fetchJson(`/v1/maps/${state.currentMap.id}/zones`, {
          method: "POST",
          body: { name, type, geojson, color: "#7c5cff" }
        });
        
        layer.options.id = res.id;
        layer.bindTooltip(`<strong>${safeText(name)}</strong>`, { sticky: true });
        state.zonesLayer.addLayer(layer);
        toast("✅ Zona guardada");
      } catch (err) {
        toast("❌ Error al guardar zona", "error");
      }
    });

    state.map.on(L.Draw.Event.DELETED, async (e) => {
      if (!state.currentMap) return;
      const layers = e.layers;
      const promises = [];
      layers.eachLayer((layer) => {
        if (layer.options.id) {
          promises.push(
            fetchJson(`/v1/maps/${state.currentMap.id}/zones/${layer.options.id}`, {
              method: "DELETE"
            }).then(() => true).catch((err) => {
              console.error("Error deleting zone:", layer.options.id, err);
              return false;
            })
          );
        }
      });
      const results = await Promise.all(promises);
      const successCount = results.filter(Boolean).length;
      if (successCount > 0) {
        toast(successCount === 1 ? "🗑️ Zona eliminada" : `🗑️ ${successCount} zonas eliminadas`);
      }
    });

    state.map.on(L.Draw.Event.EDITED, async (e) => {
      if (!state.currentMap) return;
      const layers = e.layers;
      layers.eachLayer(async (layer) => {
        if (layer.options.id) {
          try {
            const geojson = JSON.stringify(layer.toGeoJSON());
            await fetchJson(`/v1/maps/${state.currentMap.id}/zones/${layer.options.id}`, {
              method: "PATCH",
              body: { geojson }
            });
            toast("💾 Zona actualizada");
          } catch (err) { console.error("Error updating zone:", err); }
        }
      });
    });
  }

  // Cargar zonas iniciales si hay plano seleccionado
  if (state.currentMap) loadZones(state.currentMap.id);
}

export async function loadZones(mapId) {
  if (!state.map || !state.zonesLayer) return;
  state.zonesLayer.clearLayers();

  try {
    const zones = await fetchJson(`/v1/maps/${mapId}/zones`);
    zones.forEach(z => {
      try {
        const geo = JSON.parse(z.geojson);
        const layer = L.geoJSON(geo, {
          style: { color: z.color, weight: 2, fillOpacity: 0.2 }
        });

        layer.eachLayer(l => {
          l.options.id = z.id;
          l.bindTooltip(`<strong>${safeText(z.name)}</strong>`, { sticky: true });
          state.zonesLayer.addLayer(l);
        });
      } catch (err) {
        console.error("Error loading zone:", z.id, z.name, err);
      }
    });
  } catch (err) {
    console.error("Error loading zones:", err);
  }
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

function getPriorityColor(p) {
  switch (p) {
    case "critical": return "#e74c3c";
    case "high": return "#e67e22";
    case "low": return "#2ecc71";
    default: return "#f1c40f";
  }
}

export function addMarkers(items, onClickMarker) {
  ensureMap();
  if (!state.markersLayer || !Array.isArray(items)) return;

  const currentUser = getUser();
  const isMobile = getIsMobile();

  items.forEach((it) => {
    if (!it || it.lat == null || it.lng == null) return;
    
    // FILTRO VISUAL: Solo mostrar marcadores del plano actual
    if (state.currentMap && it.map_id !== state.currentMap.id) return;

    const lat = Number(it.lat);
    const lng = Number(it.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    const isMine = currentUser && it.created_by === currentUser.id;
    const catCol = catColor(it.category);
    const prioCol = getPriorityColor(it.priority);
    
    // El color del borde refleja la prioridad, el fondo la categoría
    const m = L.circleMarker([lat, lng], { 
      radius: isMobile ? 10 : 7, 
      weight: it.priority === 'critical' ? 5 : (it.priority === 'high' ? 3 : 2),
      opacity: 1, 
      fillOpacity: 0.7,
      color: prioCol, // Borde por prioridad
      fillColor: catCol // Relleno por categoría
    });

    const title = safeText(it.title);
    const cat = safeText(it.category);
    const st = safeText(statusLabel(it.status));
    const prioLabel = it.priority && it.priority !== 'medium' ? ` · <strong>${String(it.priority).toUpperCase()}</strong>` : '';
    const author = it.created_by_username ? `<br><small>👤 ${safeText(it.created_by_username)}</small>` : '';
    
    m.bindPopup(`<strong>${title}</strong><br>${cat} · ${st}${prioLabel}${author}`);
    
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