import { LS_FAVS, LS_MINE } from "./config.js";

// Estado global mutable
export const state = {
  busyCount: 0,
  isLoading: false,
  lastGeoGestureAt: 0,
  currentPage: 1,
  hasMore: true,
  map: null,
  markerPin: null,
  markersLayer: null,
  allItemsById: new Map(),
  manualLocationArmed: false,
  
  // Elementos DOM cacheados que se usan en múltiples sitios
  els: {} 
};

// Helpers de persistencia simple
function readJsonLS(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJsonLS(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

// Getters/Setters para favoritos y propios
export function getFavSet() {
  return new Set(readJsonLS(LS_FAVS, []));
}

export function isFav(id) {
  return getFavSet().has(String(id));
}

export function toggleFav(id) {
  const s = getFavSet();
  const k = String(id);
  if (s.has(k)) s.delete(k);
  else s.add(k);
  writeJsonLS(LS_FAVS, Array.from(s));
}

export function getMineSet() {
  return new Set(readJsonLS(LS_MINE, []));
}

export function isMine(id) {
  return getMineSet().has(String(id));
}

export function markMine(id) {
  const s = getMineSet();
  s.add(String(id));
  writeJsonLS(LS_MINE, Array.from(s));
}
