(() => {
  "use strict";

  window.onerror = function(msg, url, line) {
    if (msg === "ResizeObserver loop completed with undelivered notifications.") return;
    const err = `Error crítico JS: ${msg}\nLínea: ${line}`;
    console.error(err);
    // Mostrar en interfaz si es posible, fallback a alert
    const statusEl = document.getElementById("status");
    if (statusEl) {
        statusEl.textContent = err;
        statusEl.dataset.kind = "error";
    } else {
        alert(err);
    }
  };

  // -------------------- state & config --------------------
  const API_BASE = "/v1";
  const LS_API_KEY = "cola_api_key";
  const LS_FAVS = "cola_favs";
  const LS_MINE = "cola_mine";

  let busyCount = 0;
  let isLoading = false;
  let lastGeoGestureAt = 0;
  let currentPage = 1;
  const pageSize = 10;
  let hasMore = true;

  let map = null;
  let markerPin = null;
  let markersLayer = null;
  let globalLoadingEl = null;
  let filePreviewImg = null;
  let toastHost = null;
  let manualLocationArmed = false;

  // DOM Elements
  const $ = (sel) => document.querySelector(sel);
  const elApiKey = $("#apiKey");
  const btnSaveKey = $("#btnSaveKey");
  const statusEl = $("#status");
  const elTitle = $("#title");
  const elCategory = $("#category");
  const elDescription = $("#description");
  const elLat = $("#lat");
  const elLng = $("#lng");
  const elFile = $("#file"); // Documento
  const elPhoto = $("#photo"); // Foto
  const btnRefresh = $("#btnRefresh");
  const btnClear = $("#btnClear");
  const btnLocate = $("#btnLocate");
  const mapEl = $("#map");
  const listEl = $("#list");

  // Filter elements (will be assigned in ensureFiltersBar)
  let qEl, fStatusEl, fCategoryEl, sortEl, onlyMineEl, onlyFavsEl, btnMoreEl, btnAddrEl, addrInlineEl;

  const allItemsById = new Map();

  // -------------------- helpers --------------------
  function safeText(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function setStatus(msg, kind = "info") {
    if (!statusEl) return;
    statusEl.textContent = msg || "";
    statusEl.dataset.kind = kind;
  }

  function getApiKey() {
    return (localStorage.getItem(LS_API_KEY) || "").trim();
  }

  // -------------------- UX: busy overlay + disable controls --------------------

  function setButtonBusy(btn, busy, labelBusy = "Cargando…") {
    if (!btn) return;
    const current = Number(btn.dataset.busyCount || 0);
    if (busy) {
      if (!btn.dataset.labelIdle) btn.dataset.labelIdle = btn.textContent;
      btn.dataset.busyCount = String(current + 1);
      btn.disabled = true;
      btn.classList.add("busy");
      btn.textContent = labelBusy;
      return;
    }
    const next = Math.max(current - 1, 0);
    btn.dataset.busyCount = String(next);
    if (next === 0) {
      btn.disabled = false;
      btn.classList.remove("busy");
      if (btn.dataset.labelIdle) {
        btn.textContent = btn.dataset.labelIdle;
        delete btn.dataset.labelIdle;
      }
    }
  }

  function setControlsDisabled(disabled) {
    const submitBtn = document.querySelector('form button[type="submit"]');
    const toDisable = [
      btnRefresh,
      btnClear,
      btnLocate,
      btnSaveKey,
      btnMoreEl,
      btnAddrEl,
      submitBtn,
    ].filter(Boolean);

    toDisable.forEach((el) => {
      try {
        el.disabled = !!disabled;
        el.style.opacity = disabled ? "0.6" : "";
        el.style.pointerEvents = disabled ? "none" : "";
      } catch { /* noop */ }
    });

    if (listEl) {
      listEl.querySelectorAll("button").forEach((el) => {
        if (typeof el.disabled !== "undefined") {
          el.disabled = !!disabled;
        }
      });
    }
  }

  function ensureGlobalLoading() {
    if (globalLoadingEl) return;
    globalLoadingEl = document.getElementById("globalLoading");
    if (globalLoadingEl) return;

    const el = document.createElement("div");
    el.id = "globalLoading";
    el.setAttribute("aria-hidden", "true");
    el.style.cssText = [
      "position:fixed",
      "inset:0",
      "display:none",
      "align-items:center",
      "justify-content:center",
      "background:rgba(0,0,0,.28)",
      "z-index:11000",
      "backdrop-filter:saturate(120%) blur(2px)",
    ].join(";");

    el.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:10px; align-items:center;">
        <div style="width:38px;height:38px;border-radius:999px;border:3px solid rgba(255,255,255,.35);border-top-color:#fff;animation:spin 0.9s linear infinite;"></div>
        <div id="globalLoadingText" style="color:#fff; font-weight:600; text-shadow:0 2px 18px rgba(0,0,0,.35);">Cargando…</div>
      </div>
      <style>
        @keyframes spin { from { transform: rotate(0deg);} to { transform: rotate(360deg);} }
      </style>
    `;

    document.body.appendChild(el);
    globalLoadingEl = el;
  }

  function setGlobalLoading(on, text = "Cargando…") {
    ensureGlobalLoading();
    const t = globalLoadingEl.querySelector("#globalLoadingText");
    if (t) t.textContent = text;
    globalLoadingEl.style.display = on ? "flex" : "none";
    globalLoadingEl.setAttribute("aria-hidden", on ? "false" : "true");
  }

  function withBusy(
    fn,
    {
      overlayText = "Cargando…",
      showOverlay = true,
      disableControls = true,
    } = {}
  ) {
    return async (...args) => {
      busyCount++;
      if (busyCount === 1) {
        if (showOverlay) setGlobalLoading(true, overlayText);
        if (disableControls) setControlsDisabled(true);
      }
      try {
        return await fn(...args);
      } finally {
        busyCount = Math.max(0, busyCount - 1);
        if (busyCount === 0) {
          if (showOverlay) setGlobalLoading(false);
          if (disableControls) setControlsDisabled(false);
        }
      }
    };
  }

  function renderSkeletonList(count = 6) {
    if (!listEl) return;
    const items = Array.from({ length: count }).map(() => {
      return `
        <div class="issueCard" style="opacity:.9;">
          <div class="thumbBox">
            <div style="width:64px;height:64px;border-radius:12px;background:rgba(255,255,255,.08);"></div>
          </div>
          <div class="issueMain" style="min-width:0;">
            <div style="height:14px;width:55%;border-radius:8px;background:rgba(255,255,255,.10);margin:6px 0 10px 0;"></div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;">
              <div style="height:18px;width:86px;border-radius:999px;background:rgba(255,255,255,.08);"></div>
              <div style="height:18px;width:74px;border-radius:999px;background:rgba(255,255,255,.08);"></div>
              <div style="height:18px;width:110px;border-radius:999px;background:rgba(255,255,255,.08);"></div>
            </div>
            <div style="height:10px;width:92%;border-radius:8px;background:rgba(255,255,255,.07);margin:6px 0;"></div>
            <div style="height:10px;width:78%;border-radius:8px;background:rgba(255,255,255,.07);margin:6px 0 12px 0;"></div>
            <div style="display:flex;gap:10px;flex-wrap:wrap;">
              <div style="height:28px;width:110px;border-radius:10px;background:rgba(255,255,255,.07);"></div>
              <div style="height:28px;width:110px;border-radius:10px;background:rgba(255,255,255,.07);"></div>
              <div style="height:28px;width:110px;border-radius:10px;background:rgba(255,255,255,.07);"></div>
            </div>
          </div>
        </div>
      `;
    });
    listEl.innerHTML = items.join("");
  }

  // -------------------- file previews --------------------
  
  function updatePhotoPreview(file) {
    const box = document.getElementById("photoPreview");
    const img = document.getElementById("photoPreviewImg");
    const meta = document.getElementById("photoPreviewMeta");
    const btn = document.getElementById("btnClearPhotoInput");
    
    if (!box || !img || !meta) return;

    if (!file) {
      box.style.display = "none";
      img.src = "";
      meta.textContent = "";
      return;
    }

    box.style.display = "flex";
    meta.textContent = `${file.name} · ${Math.round(file.size / 1024)} KB`;
    
    const url = URL.createObjectURL(file);
    img.src = url;
    img.onload = () => URL.revokeObjectURL(url);

    if (btn) btn.onclick = () => {
       if (elPhoto) elPhoto.value = "";
       updatePhotoPreview(null);
    };
  }

  function updateDocPreview(file) {
    const box = document.getElementById("filePreview");
    const meta = document.getElementById("filePreviewMeta");
    const btn = document.getElementById("btnClearFileInput");
    
    if (!box || !meta) return;

    if (!file) {
      box.style.display = "none";
      meta.textContent = "";
      return;
    }

    box.style.display = "flex";
    meta.innerHTML = `<strong>${file.name}</strong> <br> <span style="font-size:11px;opacity:.7;">${Math.round(file.size/1024)} KB</span>`;

    if (btn) btn.onclick = () => {
       if (elFile) elFile.value = "";
       updateDocPreview(null);
    };
  }

  if (elPhoto) {
    elPhoto.addEventListener("change", () => {
       const f = elPhoto.files && elPhoto.files[0] ? elPhoto.files[0] : null;
       updatePhotoPreview(f);
    });
  }

  if (elFile) {
    elFile.addEventListener("change", () => {
      const f = elFile.files && elFile.files[0] ? elFile.files[0] : null;
      updateDocPreview(f);
    });
  }

  // -------------------- global loading (solo flag + status) --------------------
  // Nota: el bloqueo real (overlay + disable) lo gestiona withBusy() / setControlsDisabled().

  /**
   * setLoading SOLO mantiene un flag y, opcionalmente, muestra/limpia mensaje.
   * No deshabilita controles (eso ya lo hace withBusy()).
   */
  function setLoading(on, msg = "") {
    isLoading = !!on;

    // Mensaje opcional
    if (msg) {
      setStatus(msg, "info");
    } else if (!isLoading) {
      // si apagamos y no hay msg, limpiamos estado informativo
      setStatus("", "info");
    }

    // Flag por si quieres CSS: body[data-loading="1"] { ... }
    document.body.dataset.loading = isLoading ? "1" : "0";
  }

  // geolocation: enforce user-gesture window to avoid browser violations
  function markGeoGesture() {
    lastGeoGestureAt = Date.now();
  }

  // -------------------- UX: toasts (notificaciones no bloqueantes) --------------------
  function ensureToasts() {
    if (toastHost) return toastHost;
    toastHost = document.getElementById("toastHost");
    if (toastHost) return toastHost;

    const el = document.createElement("div");
    el.id = "toastHost";
    el.style.cssText = [
      "position:fixed",
      "right:14px",
      "bottom:14px",
      "display:flex",
      "flex-direction:column",
      "gap:10px",
      "z-index:12000",
      "max-width:min(420px, calc(100vw - 28px))",
    ].join(";");

    document.body.appendChild(el);
    toastHost = el;
    return toastHost;
  }

  function toast(msg, kind = "info", ttl = 2600) {
    const host = ensureToasts();
    const t = document.createElement("div");

    const border =
      kind === "ok"
        ? "rgba(34,197,94,.55)"
        : kind === "warn"
        ? "rgba(245,158,11,.55)"
        : kind === "error"
        ? "rgba(239,68,68,.55)"
        : "rgba(148,163,184,.45)";

    t.style.cssText = [
      "background: rgba(17,17,17,.92)",
      "border: 1px solid " + border,
      "border-radius: 14px",
      "padding: 10px 12px",
      "box-shadow: 0 18px 60px rgba(0,0,0,.35)",
      "backdrop-filter: blur(6px)",
      "color: #fff",
      "display:flex",
      "gap:10px",
      "align-items:flex-start",
    ].join(";");

    t.innerHTML = `
      <div style="flex:1; font-size:13px; line-height:1.3;">
        ${safeText(msg)}
      </div>
      <button class="btn small" style="padding:4px 8px; line-height:1; opacity:.85;">✕</button>
    `;

    const close = () => {
      if (!t.isConnected) return;
      t.style.opacity = "0";
      t.style.transform = "translateY(6px)";
      setTimeout(() => t.remove(), 180);
    };

    const btn = t.querySelector("button");
    if (btn) btn.addEventListener("click", close);

    t.style.opacity = "0";
    t.style.transform = "translateY(6px)";
    t.style.transition = "opacity .18s ease, transform .18s ease";
    host.appendChild(t);
    requestAnimationFrame(() => {
      t.style.opacity = "1";
      t.style.transform = "translateY(0)";
    });

    setTimeout(close, ttl);
  }

  // -------------------- UX: fallback manual location --------------------
  // Si la geolocalización falla (CoreLocationUnknown / timeout), permitimos al usuario fijar el punto con un clic.
  function armManualLocationPick() {
    if (manualLocationArmed) return;
    manualLocationArmed = true;

    ensureMap();

    setStatus(
      "No se pudo obtener tu ubicación. Haz clic en el mapa para fijarla manualmente.",
      "warn"
    );

    // Leaflet: captura un único clic
    try {
      if (map && typeof map.once === "function") {
        map.once("click", (ev) => {
          manualLocationArmed = false;
          const lat = ev?.latlng?.lat;
          const ln = ev?.latlng?.lng;
          if (lat == null || ln == null) {
            setStatus(
              "No pude leer las coordenadas del clic. Inténtalo de nuevo.",
              "warn"
            );
            return;
          }
          setLatLng(lat, ln, { pan: true, setPin: true });
          setStatus("Ubicación fijada manualmente ✅", "ok");
        });
        return;
      }
    } catch {
      /* ignore */
    }
  }

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

  function resolveSameOriginUrl(u) {
    const s = String(u || "").trim();
    if (!s) return "";

    // Already relative
    if (s.startsWith("/")) return s;

    // Try to turn absolute localhost URLs into same-origin relative paths
    try {
      const parsed = new URL(s, window.location.origin);

      // If it's the same origin already, keep only path+query+hash
      if (parsed.origin === window.location.origin) {
        return parsed.pathname + parsed.search + parsed.hash;
      }

      // If it's localhost/127.0.0.1 but different port/proto (e.g. http://localhost:3000),
      // rewrite to current origin by keeping only the path+query+hash.
      const hn = (parsed.hostname || "").toLowerCase();
      if (
        hn === "localhost" ||
        hn === "127.0.0.1" ||
        hn.endsWith(".localhost")
      ) {
        return parsed.pathname + parsed.search + parsed.hash;
      }

      // Otherwise, leave as-is (might be a CDN)
      return s;
    } catch {
      return s;
    }
  }

  function setImgFallback(
    img,
    { fallbackSrc = "", onFailReplace = true } = {}
  ) {
    if (!img) return;

    // performance hints
    try {
      img.loading = "lazy";
    } catch {
      /* ignore */
    }
    try {
      img.decoding = "async";
    } catch {
      /* ignore */
    }

    img.addEventListener(
      "error",
      () => {
        // If we have a fallback URL and it's not already the one in use, swap to it
        if (fallbackSrc && img.getAttribute("data-fallback-used") !== "1") {
          img.setAttribute("data-fallback-used", "1");
          img.src = fallbackSrc;
          return;
        }

        // Otherwise, replace with a small placeholder
        if (onFailReplace) {
          const ph = document.createElement("div");
          ph.className = "noimg";
          ph.textContent = "sin foto";
          img.replaceWith(ph);
        }
      },
      { once: false }
    );
  }

  function isMutatingMethod(m) {
    const mm = String(m || "GET").toUpperCase();
    return ["POST", "PUT", "PATCH", "DELETE"].includes(mm);
  }

  function favSet() {
    return new Set(readJsonLS(LS_FAVS, []));
  }

  function mineSet() {
    return new Set(readJsonLS(LS_MINE, []));
  }

  function isFav(id) {
    return favSet().has(String(id));
  }

  function toggleFav(id) {
    const s = favSet();
    const k = String(id);
    if (s.has(k)) s.delete(k);
    else s.add(k);
    writeJsonLS(LS_FAVS, Array.from(s));
  }

  function isMine(id) {
    return mineSet().has(String(id));
  }

  function markMine(id) {
    const s = mineSet();
    s.add(String(id));
    writeJsonLS(LS_MINE, Array.from(s));
  }

  function statusLabel(st) {
    // DEBUG (opcional): exponer para consola
    window.__cola = window.__cola || {};
    window.__cola.statusLabel = statusLabel;
    switch (String(st)) {
      case "open":
        return "Abierta";
      case "in_progress":
        return "En curso";
      case "resolved":
        return "Resuelta";
      default:
        return String(st || "");
    }
  }

  function catColor(cat) {
    const c = String(cat || "").toLowerCase();
    if (c.includes("alumbr")) return "#3b82f6";
    if (c.includes("bache")) return "#f97316";
    if (c.includes("basur")) return "#22c55e";
    if (c.includes("agua")) return "#06b6d4";
    if (c.includes("ruido")) return "#a855f7";
    return "#94a3b8";
  }

  // -------------------- fetch helpers --------------------
  // CSRF cache (módulo)
  let csrfToken = null;
  let csrfUnavailable = false;
  let csrfInFlight = null;
  let csrfRetryAfterAt = 0; // timestamp ms; evita martillear /csrf en fallos transitorios
  let csrfFailureCount = 0;

  async function getCsrfToken() {
    if (csrfToken) return csrfToken;
    if (csrfUnavailable) return null;
    // Si el backend expone config y CSRF está deshabilitado, evita el fetch.
    // Nota: si no hay valor (null) mantenemos el comportamiento previo (intentar fetch).
    const csrfEnabled = localStorage.getItem("csrfEnabled");
    if (csrfEnabled === "0") return null;

    const now = Date.now();
    if (csrfRetryAfterAt && now < csrfRetryAfterAt) return null;
    if (csrfInFlight) return csrfInFlight;

    const CSRF_OPTOUT_STATUSES = new Set([204, 404, 501]);
    const MAX_ATTEMPTS = 3;
    const BASE_DELAY_MS = 250;
    const JITTER_MS = 125;
    const MAX_COOLDOWN_MS = 30_000;

    const attemptFetch = async () => {
      const res = await fetch(`${API_BASE}/csrf`, {
        method: "GET",
        credentials: "include",
        headers: { accept: "application/json" },
      });

      // Opt-out explícito del servidor: deshabilita permanentemente para la página.
      if (CSRF_OPTOUT_STATUSES.has(res.status)) {
        csrfUnavailable = true;
        return null;
      }

      // Resto de no-OK: considéralos transitorios (no flips del flag).
      if (!res.ok) {
        const err = new Error(`CSRF HTTP ${res.status}`);
        err.status = res.status;
        throw err;
      }

      const data = await res.json().catch(() => null);
      const token = data?.token;
      if (!token) {
        // Respuesta OK pero sin token => tratamos como fallo transitorio.
        throw new Error("CSRF token missing");
      }

      csrfToken = token;
      csrfFailureCount = 0;
      csrfRetryAfterAt = 0;
      return csrfToken;
    };

    const p = (async () => {
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
          return await attemptFetch();
        } catch {
          // Si durante el intento descubrimos opt-out, salimos ya.
          if (csrfUnavailable) return null;

          csrfFailureCount = Math.min(csrfFailureCount + 1, 20);

          // Último intento: aplica TTL/cooldown antes de permitir reintentos futuros.
          if (attempt === MAX_ATTEMPTS) {
            const cooldownMs = Math.min(
              MAX_COOLDOWN_MS,
              BASE_DELAY_MS * Math.pow(2, Math.max(0, csrfFailureCount - 1))
            );
            csrfRetryAfterAt = Date.now() + cooldownMs;
            return null;
          }

          // Backoff corto para reintentar dentro de la misma llamada.
          const delayMs =
            BASE_DELAY_MS * Math.pow(2, attempt - 1) +
            Math.floor(Math.random() * JITTER_MS);
          await new Promise((r) => setTimeout(r, delayMs));
        }
      }
      return null;
    })();

    csrfInFlight = p.finally(() => {
      csrfInFlight = null;
    });
    return csrfInFlight;
  }

  async function getConfig() {
    try {
      const res = await fetch(`${API_BASE}/config`, { credentials: "include" });
      if (!res.ok) return;
      const cfg = await res.json().catch(() => ({}));
      if (cfg.csrfEnabled === true) localStorage.setItem("csrfEnabled", "1");
      if (cfg.csrfEnabled === false) localStorage.setItem("csrfEnabled", "0");
    } catch (e) {
      console.warn("getConfig error:", e);
    }
  }

  async function loadCategories() {
    try {
      const cats = await fetchJson(`${API_BASE}/issues/categories`);
      if (!Array.isArray(cats)) return;

      const fillDatalist = (id) => {
        const dl = document.getElementById(id);
        if (!dl) return;
        dl.innerHTML = cats.map(c => `<option value="${safeText(c)}"></option>`).join("");
      };

      fillDatalist("categoryOptions");
      fillDatalist("categoryOptionsFilter");
    } catch (e) {
      console.warn("Error loading categories:", e);
    }
  }

  // -------------------- fetch helpers --------------------
  async function fetchJson(url, opts = {}) {
    const headers = new Headers(opts.headers || {});
    headers.set("accept", "application/json");

    // API KEY (frontend)
    const key = getApiKey();
    if (key) headers.set("x-api-key", key);

    // CSRF only for mutating requests (if endpoint exists)
    const method = String(opts.method || "GET").toUpperCase();
    if (isMutatingMethod(method)) {
      const token = await getCsrfToken();
      if (token) {
        headers.set("x-csrf-token", token);
      }
    }

    // Timeout controller (15s limit)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
      const res = await fetch(url, {
        ...opts,
        credentials: "include",
        headers,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const ct = res.headers.get("content-type") || "";
      let data = null;

      if (ct.includes("application/json")) {
        data = await res.json().catch(() => null);
      } else {
        const txt = await res.text().catch(() => "");
        data = { error: { message: txt || `Error HTTP ${res.status}` } };
      }

      if (!res.ok) {
        const msg = data?.error?.message || data?.message || `HTTP ${res.status}`;
        const err = new Error(msg);
        err.status = res.status;
        err.data = data;
        throw err;
      }

      return data;
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
         throw new Error("La petición tardó demasiado (timeout). Inténtalo de nuevo.");
      }
      throw err;
    }
  }

  // -------------------- map --------------------
  function ensureMap() {
    if (map || !mapEl || typeof L === "undefined") return;

    // Gestor de Tareas sobre Plano: L.CRS.Simple para coordenadas cartesianas
    map = L.map(mapEl, {
      crs: L.CRS.Simple,
      minZoom: -1,
      maxZoom: 4,
      zoomControl: true
    });

    // Dimensiones de referencia (1000x1000). El usuario debe proveer plano.jpg en src/public/ui/
    const bounds = [[0, 0], [1000, 1000]];
    const imageUrl = "/ui/plano.jpg"; 

    L.imageOverlay(imageUrl, bounds).addTo(map);
    map.fitBounds(bounds);

    markersLayer = L.layerGroup().addTo(map);

    map.on("click", (ev) => {
      if (!ev || !ev.latlng) return;
      setLatLng(ev.latlng.lat, ev.latlng.lng, { pan: false, setPin: true });
    });
  }

  function clearMarkers() {
    if (markersLayer) markersLayer.clearLayers();
  }

  function addMarkers(items) {
    ensureMap();
    if (!markersLayer || !Array.isArray(items)) return;

    items.forEach((it) => {
      if (!it || it.lat == null || it.lng == null) return;
      const lat = Number(it.lat);
      const lng = Number(it.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

      const m = L.circleMarker([lat, lng], {
        radius: 7,
        weight: 2,
        opacity: 0.9,
        fillOpacity: 0.6,
      });
      m.setStyle({
        color: catColor(it.category),
        fillColor: catColor(it.category),
      });

      const title = safeText(it.title);
      const cat = safeText(it.category);
      const st = safeText(statusLabel(it.status));
      m.bindPopup(`<strong>${title}</strong><br>${cat} · ${st}`);
      m.on("click", () => {
        const card = document.getElementById(`issue-${it.id}`);
        if (card) card.scrollIntoView({ behavior: "smooth", block: "center" });
      });
      markersLayer.addLayer(m);
    });
  }

  function setLatLng(lat, lng, { pan = true, setPin = true } = {}) {
    const la = Number(lat);
    const ln = Number(lng);
    if (!Number.isFinite(la) || !Number.isFinite(ln)) return;

    if (elLat) elLat.value = String(la);
    if (elLng) elLng.value = String(ln);

    ensureMap();

    if (setPin && map) {
      if (!markerPin) {
        markerPin = L.marker([la, ln], { draggable: true }).addTo(map);
        markerPin.on("dragend", () => {
          const p = markerPin.getLatLng();
          setLatLng(p.lat, p.lng, { pan: false, setPin: false });
        });
      } else {
        markerPin.setLatLng([la, ln]);
      }
    }

    if (pan && map) map.setView([la, ln], Math.max(map.getZoom(), 1));
  }

  // -------------------- UI: filters binding (prefiere HTML existente) --------------------
  function ensureFiltersBar() {
    // 1) Si el HTML ya trae los filtros (tu index.html actual), SOLO enlazamos
    qEl = $("#q") || qEl;
    fStatusEl = $("#fStatus") || fStatusEl;
    fCategoryEl = $("#fCategory") || fCategoryEl;
    // en tu HTML el select de orden es #order (no #sort)
    sortEl = $("#order") || $("#sort") || sortEl;

    onlyMineEl = $("#onlyMine") || onlyMineEl;
    onlyFavsEl = $("#onlyFavs") || onlyFavsEl;

    btnMoreEl = $("#btnMore") || btnMoreEl;

    // si al menos existe el input q o algún filtro, damos por enlazado y NO inyectamos
    const hasExisting = !!(
      qEl ||
      fStatusEl ||
      fCategoryEl ||
      sortEl ||
      onlyMineEl ||
      onlyFavsEl ||
      btnMoreEl
    );

    // 2) Si NO existen, inyectamos una barra mínima encima de la lista
    if (!hasExisting) {
      if (!listEl) return;
      const host = listEl.parentElement || document.body;
      if (host.querySelector("#filtersBar")) return;

      const bar = document.createElement("div");
      bar.id = "filtersBar";
      bar.style.cssText = `
        display:flex; flex-wrap:wrap; gap:10px; align-items:center;
        padding: 10px 0;
      `;

      bar.innerHTML = `
        <input id="q" placeholder="Buscar (título/desc)" style="flex:1; min-width:220px; padding:10px 12px; border-radius:10px; border:1px solid rgba(128,128,128,.35); background: transparent; color: inherit;">
        <select id="fStatus" style="padding:10px 12px; border-radius:10px; border:1px solid rgba(128,128,128,.35); background: transparent; color: inherit;">
          <option value="">Estado (todos)</option>
          <option value="open">Abierta</option>
          <option value="in_progress">En curso</option>
          <option value="resolved">Resuelta</option>
        </select>
        <input id="fCategory" list="categoryOptionsFilter" placeholder="Categoría: todas" style="padding:10px 12px; border-radius:10px; border:1px solid rgba(128,128,128,.35); background: transparent; color: inherit;">
        <datalist id="categoryOptionsFilter">
          <option value="alumbrado">Alumbrado</option>
          <option value="limpieza">Limpieza</option>
          <option value="baches">Baches</option>
          <option value="ruido">Ruido</option>
          <option value="otros">Otros</option>
        </datalist>
        <select id="order" style="padding:10px 12px; border-radius:10px; border:1px solid rgba(128,128,128,.35); background: transparent; color: inherit;">
          <option value="new">Más nuevas</option>
          <option value="old">Más antiguas</option>
          <option value="cat">Categoría</option>
          <option value="status">Estado</option>
        </select>

        <label style="display:flex; align-items:center; gap:6px; padding:8px 10px; border:1px solid rgba(128,128,128,.25); border-radius:12px;">
          <input id="onlyMine" type="checkbox">
          Mis tareas
        </label>

        <label style="display:flex; align-items:center; gap:6px; padding:8px 10px; border:1px solid rgba(128,128,128,.25); border-radius:12px;">
          <input id="onlyFavs" type="checkbox">
          Favoritos ⭐
        </label>

        <button id="btnMore" class="btn">Más</button>
      `;

      host.insertBefore(bar, listEl);

      qEl = $("#q");
      fStatusEl = $("#fStatus");
      fCategoryEl = $("#fCategory");
      sortEl = $("#order") || $("#sort");
      onlyMineEl = $("#onlyMine");
      onlyFavsEl = $("#onlyFavs");
      btnMoreEl = $("#btnMore");
      btnAddrEl = $("#btnAddr");
    }

    // 3) Enlazar eventos UNA sola vez
    if (ensureFiltersBar._bound) return;
    ensureFiltersBar._bound = true;

    const reload = () => loadIssues({ reset: true });

    // debounce para búsqueda (NO reutilices addrTimer)
    let qTimer = null;
    if (qEl) {
      qEl.addEventListener("input", () => {
        clearTimeout(qTimer);
        qTimer = setTimeout(reload, 250);
      });
    }

    let fCatTimer = null;
    if (fCategoryEl) {
      fCategoryEl.addEventListener("input", () => {
        clearTimeout(fCatTimer);
        fCatTimer = setTimeout(reload, 400);
      });
    }

    if (fStatusEl) fStatusEl.addEventListener("change", reload);
    if (sortEl) sortEl.addEventListener("change", reload);
    if (onlyMineEl) onlyMineEl.addEventListener("change", reload);
    if (onlyFavsEl) onlyFavsEl.addEventListener("change", reload);

    if (btnMoreEl)
      btnMoreEl.addEventListener("click", async () => {
        setButtonBusy(btnMoreEl, true, "Cargando…");
        try {
          await loadIssues({ reset: false });
        } finally {
          setButtonBusy(btnMoreEl, false);
        }
      });
  }

  // -------------------- api query --------------------
  function buildQuery(page) {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));
    params.set("_t", String(Date.now())); // Cache busting

    const q = (qEl?.value || "").trim();
    const st = (fStatusEl?.value || "").trim();
    const cat = (fCategoryEl?.value || "").trim();
    // en el HTML: #order = new|old|cat|status
    const order = (sortEl?.value || "new").trim();

    if (q) params.set("q", q);
    if (st) params.set("status", st);
    if (cat) params.set("category", cat);
    if (order) params.set("order", order);

    return params.toString();
  }

  function _renderEmptyState({ title = "Sin resultados", hint = "" } = {}) {
    if (!listEl) return;

    listEl.innerHTML = `
      <div class="issueCard" style="opacity:.9; padding:14px;">
        <div class="issueMain" style="width:100%;">
          <div class="issueTitle" style="margin-bottom:8px;">${safeText(
            title
          )}</div>
          <div class="issueDesc" style="opacity:.85;">
            ${safeText(hint || "No hay tareas que mostrar.")}
          </div>
          <div style="margin-top:12px; display:flex; gap:10px; flex-wrap:wrap;">
            <button class="btn small" id="emptyRefresh">🔄 Refrescar</button>
            <button class="btn small" id="emptyClearFilters">🧹 Quitar filtros</button>
          </div>
        </div>
      </div>
    `;

    const r = document.getElementById("emptyRefresh");
    if (r)
      r.addEventListener("click", () =>
        loadIssues({ reset: true }).catch(() => {})
      );

    const c = document.getElementById("emptyClearFilters");
    if (c) {
      c.addEventListener("click", () => {
        try {
          if (qEl) qEl.value = "";
          if (fStatusEl) fStatusEl.value = "";
          if (fCategoryEl) fCategoryEl.value = "";
          if (sortEl) sortEl.value = "new";
          if (onlyMineEl) onlyMineEl.checked = false;
          if (onlyFavsEl) onlyFavsEl.checked = false;
        } catch {
          /* ignore */
        }
        loadIssues({ reset: true }).catch(() => {});
      });
    }
  }

  // API pública (sin underscore) para el resto del módulo.
  function renderEmptyState(opts) {
    return _renderEmptyState(opts);
  }

  /* -------------------- RENDER LIST (Rows) -------------------- */
  function renderList(items, mode = "replace") {
    if (!listEl) return;

    if (mode === "replace") {
      listEl.innerHTML = "";
      if (!items || items.length === 0) {
        renderEmptyState({
          title: "No hay tareas",
          hint: "Prueba a cambiar filtros o crea una nueva.",
        });
        return;
      }
    }

    items.forEach((it) => {
      allItemsById.set(it.id, it);

      const row = document.createElement("div");
      row.className = "issueRow";
      row.id = `issue-${it.id}`;
      row.style.setProperty("--catColor", catColor(it.category));
      
      // Accessibility
      row.setAttribute("role", "button");
      row.setAttribute("tabindex", "0");
      row.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") openDetailModal(it);
      });

      const title = safeText(it.title);
      const desc = safeText(it.description); // Solo para tooltip o preview corto
      const dateStr = it.created_at ? new Date(it.created_at).toLocaleDateString() : "";
      
      const thumbUrl = resolveSameOriginUrl(it.thumb_url || "");
      const hasThumb = !!thumbUrl;
      const hasDoc = !!it.text_url;
      
      let thumbHtml;
      if (hasThumb) {
         thumbHtml = `<img class="thumb" src="${thumbUrl}" alt="foto" loading="lazy">`;
      } else if (hasDoc) {
         thumbHtml = `<div class="thumb" style="display:flex;align-items:center;justify-content:center;font-size:24px;background:rgba(255,255,255,.08);">📄</div>`;
      } else {
         thumbHtml = `<div class="thumb" style="display:flex;align-items:center;justify-content:center;font-size:20px;color:rgba(255,255,255,.2);">📷</div>`;
      }

      row.innerHTML = `
        ${thumbHtml}
        <div class="info">
          <div class="title">${title}</div>
          <div class="desc">${desc}</div>
          <div class="meta-mobile">${safeText(statusLabel(it.status))} · ${dateStr}</div>
        </div>
        <div class="col-cat">
          <span class="badge" style="background:var(--chip2); border:1px solid rgba(255,255,255,.1);">
             ${safeText(it.category)}
          </span>
        </div>
        <div class="col-status">
          <span class="badge" style="color:var(--text); opacity:.8;">
            ${safeText(statusLabel(it.status))}
          </span>
        </div>
        <div class="col-action" style="text-align:right; display:flex; gap:6px; justify-content:flex-end;">
          <button class="btn small btn-fav-quick" title="Favorito">${isFav(it.id) ? "⭐" : "☆"}</button>
          ${it.photo_url ? `<button class="btn small btn-photo-quick" title="Ver foto">📷</button>` : ''}
          ${it.text_url ? `<button class="btn small btn-doc-quick" title="Ver documento">📄</button>` : ''}
          <button class="btn small" style="padding:6px 10px;">➔</button>
        </div>
      `;

      // Fallback img
      const imgEl = row.querySelector("img");
      if (imgEl) setImgFallback(imgEl, { fallbackSrc: resolveSameOriginUrl(it.photo_url), onFailReplace: false });

      // Handlers
      row.addEventListener("click", () => openDetailModal(it));
      
      const btnFav = row.querySelector(".btn-fav-quick");
      if (btnFav) {
          btnFav.addEventListener("click", (e) => {
              e.stopPropagation();
              toggleFav(it.id);
              // Update icon immediately
              btnFav.textContent = isFav(it.id) ? "⭐" : "☆";
              // Optional: reload if viewing favorites only to remove it from list
              if (onlyFavsEl && onlyFavsEl.checked) loadIssues({reset: false}).catch(()=>{});
          });
      }

      const btnPhoto = row.querySelector(".btn-photo-quick");
      if (btnPhoto) {
          btnPhoto.addEventListener("click", (e) => {
              e.stopPropagation(); // Evita abrir detalle
              showPhotoModal(it.photo_url);
          });
      }

      const btnDoc = row.querySelector(".btn-doc-quick");
      if (btnDoc) {
          btnDoc.addEventListener("click", (e) => {
              e.stopPropagation();
              showDocModal(resolveSameOriginUrl(it.text_url), "Documento Adjunto");
          });
      }

      listEl.appendChild(row);
    });
  }

  // -------------------- Quick Photo Modal --------------------
  function showPhotoModal(url) {
      console.log("Opening photo modal:", url);
      const modal = document.getElementById("photoModal");
      const img = document.getElementById("photoImg");
      const close = document.getElementById("photoClose");
      if (!modal || !img) {
          console.error("Photo modal elements missing");
          return;
      }

      img.src = resolveSameOriginUrl(url);
      modal.style.display = "flex";
      
      close.onclick = hidePhotoModal;
      modal.onclick = (e) => { if (e.target === modal) hidePhotoModal(); };
  }

  function hidePhotoModal() {
      const modal = document.getElementById("photoModal");
      if (modal) modal.style.display = "none";
  }

  async function showDocModal(url, title = "Documento") {
    const modal = document.getElementById("docModal");
    const frame = document.getElementById("docFrame");
    const textContent = document.getElementById("docTextContent");
    const titleEl = document.getElementById("docModalTitle");
    const closeBtn = document.getElementById("docClose");

    if (!modal) return;

    if(titleEl) titleEl.textContent = title;
    modal.style.display = "flex";

    const isPdf = url.toLowerCase().includes(".pdf");

    if (isPdf && frame) {
        frame.style.display = "block";
        if (textContent) textContent.style.display = "none";
        
        const sep = url.includes("?") ? "&" : "?";
        frame.src = `${url}${sep}t=${Date.now()}`;
    } else if (textContent) {
        if (frame) frame.style.display = "none";
        textContent.style.display = "block";
        textContent.textContent = "Cargando contenido...";
        
        try {
            const sep = url.includes("?") ? "&" : "?";
            const res = await fetch(`${url}${sep}t=${Date.now()}`);
            if (!res.ok) throw new Error(`Error HTTP ${res.status}`);
            const text = await res.text();
            
            const isMd = url.toLowerCase().endsWith(".md") || url.toLowerCase().endsWith(".markdown");
            if (isMd && typeof marked !== "undefined") {
                textContent.innerHTML = marked.parse(text);
                textContent.style.whiteSpace = "normal";
                textContent.style.fontFamily = "system-ui, sans-serif";
                textContent.style.lineHeight = "1.6";
            } else {
                textContent.textContent = text;
                textContent.style.whiteSpace = "pre-wrap";
                textContent.style.fontFamily = "monospace";
            }
        } catch (e) {
            textContent.textContent = `No se pudo cargar el documento.\n${e.message}`;
        }
    }

    const close = () => {
      modal.style.display = "none";
      if (frame) frame.src = "about:blank";
      if (textContent) textContent.textContent = "";
    };

    if (closeBtn) closeBtn.onclick = close;
    modal.onclick = (e) => { if (e.target === modal) close(); };
  }

  // -------------------- Detail Modal Logic --------------------
  
  let currentDetailId = null;
  let currentDetailItem = null;

  function openDetailModal(it) {
    if (!it) return;
    currentDetailId = it.id;
    currentDetailItem = it;

    const modal = document.getElementById("detailModal");
    if (!modal) return;
    
    // Reset Edit Mode
    toggleEditMode(false);

    // Wire closing
    const closeBtn = document.getElementById("dmClose");
    if (closeBtn) closeBtn.onclick = closeDetailModal;
    modal.onclick = (e) => { if (e.target === modal) closeDetailModal(); };

    // Wire Edit Button
    const editBtn = document.getElementById("dmBtnEdit");
    if (editBtn) editBtn.onclick = () => toggleEditMode(true);

    // Wire Cancel Edit
    const cancelEditBtn = document.getElementById("dmBtnCancelEdit");
    if (cancelEditBtn) cancelEditBtn.onclick = () => toggleEditMode(false);

    // Wire Save Edit
    const saveEditBtn = document.getElementById("dmBtnSaveEdit");
    if (saveEditBtn) saveEditBtn.onclick = saveDetailChanges;

    // Fill View Data
    const title = safeText(it.title);
    const dateStr = it.created_at ? new Date(it.created_at).toLocaleString() : "";
    document.getElementById("dmTitle").textContent = title;
    document.getElementById("dmDate").textContent = dateStr;
    document.getElementById("dmDesc").textContent = it.description || "";
    
    // Fill Edit Data (prefill)
    const editDesc = document.getElementById("dmEditDesc");
    if (editDesc) editDesc.value = it.description || "";
    
    const editStatus = document.getElementById("dmEditStatus");
    if (editStatus) editStatus.value = it.status;
    
    // Clear edit inputs
    ["dmResPhotoInput", "dmResDocInput", "dmEditPhotoInput", "dmEditDocInput"].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.value = "";
    });
    document.getElementById("dmResPhotoPreview").textContent = "";
    document.getElementById("dmResDocPreview").textContent = "";
    document.getElementById("dmEditPhotoPreview").textContent = "";
    document.getElementById("dmEditDocPreview").textContent = "";

    // Status Badge
    const stBadge = document.getElementById("dmStatusBadge");
    if (stBadge) {
        stBadge.textContent = statusLabel(it.status);
        stBadge.style.color = it.status === 'resolved' ? 'var(--ok)' : (it.status === 'in_progress' ? 'var(--warn)' : 'var(--text)');
        stBadge.style.borderColor = it.status === 'resolved' ? 'var(--ok)' : 'var(--border2)';
    }

    // Images
    const photoUrl = resolveSameOriginUrl(it.photo_url);
    const imgCont = document.getElementById("dmImgContainer");
    const img = document.getElementById("dmImg");
    if (photoUrl) {
       imgCont.style.display = "block";
       img.src = photoUrl;
       setImgFallback(img, { onFailReplace: false });
    } else {
       imgCont.style.display = "none";
       img.src = "";
    }

    // Docs
    const textUrl = resolveSameOriginUrl(it.text_url);
    const docCont = document.getElementById("dmDocContainer");
    const docLink = document.getElementById("dmDocLink");
    if (textUrl) {
      if (docCont) docCont.style.display = "block";
      if (docLink) {
          docLink.href = textUrl;
          docLink.onclick = (e) => {
              e.preventDefault();
              showDocModal(textUrl, "Documento Adjunto");
          };
      }
    } else {
      if (docCont) docCont.style.display = "none";
    }

    // Resolution Image
    const resUrl = resolveSameOriginUrl(it.resolution_photo_url);
    const resCont = document.getElementById("dmResContainer");
    const resImg = document.getElementById("dmResImg");
    
    // Resolution Doc
    const resDocUrl = resolveSameOriginUrl(it.resolution_text_url);
    const resDocBox = document.getElementById("dmResDocBox");
    const resDocLink = document.getElementById("dmResDocLink");

    const hasResPhoto = !!resUrl;
    const hasResDoc = !!resDocUrl;

    if (hasResPhoto || hasResDoc) {
      resCont.style.display = "block";
      document.getElementById("dmResDesc").textContent = "Tarea marcada como resuelta."; 
      
      if (hasResPhoto) {
         resImg.style.display = "block";
         resImg.src = resUrl;
         setImgFallback(resImg, { onFailReplace: false });
      } else {
         resImg.style.display = "none";
      }

      if (hasResDoc) {
         resDocBox.style.display = "block";
         if (resDocLink) {
             resDocLink.href = resDocUrl;
             resDocLink.onclick = (e) => {
                 e.preventDefault();
                 showDocModal(resDocUrl, "Documento de Resolución");
             };
         }
      } else {
         resDocBox.style.display = "none";
      }

    } else {
      resCont.style.display = "none";
    }

    // Actions: Map
    const btnMap = document.getElementById("dmBtnMap");
    btnMap.onclick = (e) => {
        e.stopPropagation();
        closeDetailModal();
        setLatLng(it.lat, it.lng, { pan: true, setPin: true });
        if (mapEl) mapEl.scrollIntoView({ behavior: "smooth", block: "center" });
    };

    // Actions: Fav
    const btnFav = document.getElementById("dmBtnFav");
    const favOn = isFav(it.id);
    btnFav.textContent = favOn ? "⭐ Quitar Favorito" : "☆ Marcar Favorito";
    btnFav.onclick = (e) => {
        e.stopPropagation();
        toggleFav(it.id);
        const newFav = isFav(it.id);
        btnFav.textContent = newFav ? "⭐ Quitar Favorito" : "☆ Marcar Favorito";
        loadIssues({ reset: false }).catch(()=>{});
    };
    
    // Delete Action
    const btnDel = document.getElementById("dmBtnDelete");
    btnDel.onclick = async () => {
        if(!confirm("¿Borrar definitivamente esta tarea?")) return;
        setButtonBusy(btnDel, true, "Borrando...");
        try {
            await fetchJson(`${API_BASE}/issues/${it.id}`, { method: "DELETE" });
            toast("Tarea borrada", "ok");
            
            // Feedback instantáneo: quitar de la lista y del mapa
            const el = document.getElementById(`issue-${it.id}`);
            if (el) el.remove();
            
            // Recargar lista de fondo
            closeDetailModal();
            loadIssues({ reset: true });
        } catch(e) {
            toast(`Error: ${e.message}`, "error");
        } finally {
            setButtonBusy(btnDel, false);
        }
    };

    modal.style.display = "flex";
  }

  function toggleEditMode(enable) {
      const displayView = enable ? "none" : "block";
      const displayEdit = enable ? "block" : "none";
      const displayFlexView = enable ? "none" : "grid"; // dmActionsView uses grid
      const displayFlexEdit = enable ? "flex" : "none"; // dmActionsEdit uses flex column

      // Description
      document.getElementById("dmDesc").style.display = displayView;
      document.getElementById("dmEditDesc").style.display = displayEdit;

      // Status
      document.getElementById("dmStatusBadge").style.display = displayView;
      document.getElementById("dmEditStatus").style.display = displayEdit;

      // Original Files Replace
      document.getElementById("dmEditOriginals").style.display = displayEdit;

      // Resolution File Upload (Only show in edit mode)
      document.getElementById("dmEditResContainer").style.display = displayEdit;

      // Actions Sidebar
      document.getElementById("dmActionsView").style.display = displayFlexView;
      document.getElementById("dmActionsEdit").style.display = displayFlexEdit;
      
      // Hide "Edit" button itself while editing
      const editBtn = document.getElementById("dmBtnEdit");
      if(editBtn) editBtn.style.visibility = enable ? "hidden" : "visible";
  }

  async function saveDetailChanges() {
      if (!currentDetailId) return;
      const btn = document.getElementById("dmBtnSaveEdit");
      setButtonBusy(btn, true, "Guardando...");

      try {
          const desc = document.getElementById("dmEditDesc").value.trim();
          const status = document.getElementById("dmEditStatus").value;
          
          const photoInput = document.getElementById("dmResPhotoInput");
          const docInput = document.getElementById("dmResDocInput");
          
          const origPhotoInput = document.getElementById("dmEditPhotoInput");
          const origDocInput = document.getElementById("dmEditDocInput");
          
          const fd = new FormData();
          fd.set("description", desc);
          fd.set("status", status);
          
          if (photoInput && photoInput.files[0]) {
              fd.set("resolution_photo", photoInput.files[0]);
          }
          if (docInput && docInput.files[0]) {
              fd.set("resolution_doc", docInput.files[0]);
          }
          if (origPhotoInput && origPhotoInput.files[0]) {
              fd.set("photo", origPhotoInput.files[0]);
          }
          if (origDocInput && origDocInput.files[0]) {
              fd.set("file", origDocInput.files[0]);
          }

          const updated = await fetchJson(`${API_BASE}/issues/${currentDetailId}`, {
              method: "PATCH",
              body: fd
          });

          toast("Cambios guardados correctamente ✅", "ok");
          
          // Update local data and re-render modal content without closing if possible, or just re-open
          // Re-opening is safer to refresh thumbs and data
          await loadIssues({ reset: true }); // Refresh list completely to show changes
          
          // Re-fetch updated item to refresh modal view
          // Since loadIssues refreshes allItemsById, we can get it from there after a short delay or just close/reopen
          // Simpler: Close edit mode and update view fields manually with what we have, 
          // but resolution photo url comes from server. So better to use the response 'updated'.
          
          if (updated) openDetailModal(updated); 
          else toggleEditMode(false); // Fallback

      } catch (e) {
          toast(`Error al guardar: ${e.message}`, "error");
      } finally {
          setButtonBusy(btn, false);
      }
  }

  function closeDetailModal() {
      const modal = document.getElementById("detailModal");
      if (modal) modal.style.display = "none";
      currentDetailId = null;
      currentDetailItem = null;
  }

  // -------------------- api actions --------------------
  const loadIssues = withBusy(
    async ({ reset } = { reset: false }) => {
      ensureFiltersBar();

      // skeleton while fetching (only when resetting / first page)
      if (reset) {
        renderSkeletonList(6);
      }

      try {
        if (reset) {
          currentPage = 1;
          hasMore = true;
          allItemsById.clear();
          clearMarkers();
          renderList([], "replace");
        }

        if (!hasMore) return;

        // --- FETCH ---
        const qs = buildQuery(currentPage);
        const data = await fetchJson(`${API_BASE}/issues?${qs}`);
        const items = Array.isArray(data.items) ? data.items : [];

        // --- filtros cliente (mis tareas / favs) ---
        let filtered = items;
        if (onlyMineEl?.checked) {
          filtered = filtered.filter((it) => isMine(it.id));
          if (filtered.length === 0 && items.length > 0) {
             toast("No tienes tareas guardadas en este navegador.", "info");
          }
        }
        if (onlyFavsEl?.checked)
          filtered = filtered.filter((it) => isFav(it.id));

        // --- ordenación cliente (fallback si el server ignora `order`) ---
        const order = (sortEl?.value || "new").trim();
        filtered = filtered.slice();

        if (order === "old") {
          filtered.sort(
            (a, b) => new Date(a.created_at) - new Date(b.created_at)
          );
        } else if (order === "cat") {
          filtered.sort((a, b) =>
            String(a.category || "").localeCompare(String(b.category || ""))
          );
        } else if (order === "status") {
          const rank = (s) =>
            s === "open"
              ? 0
              : s === "in_progress"
              ? 1
              : s === "resolved"
              ? 2
              : 9;
          filtered.sort((a, b) => rank(a.status) - rank(b.status));
        } else {
          // "new" (por defecto)
          filtered.sort(
            (a, b) => new Date(b.created_at) - new Date(a.created_at)
          );
        }

        // --- render + markers ---
        // Si estamos reseteando (primera página) y NO hay nada tras filtros => empty state
        if (reset && filtered.length === 0) {
          renderEmptyState();
          clearMarkers();
        } else {
          renderList(filtered, reset ? "replace" : "append");
          addMarkers(filtered);
        }

        // --- paginación ---
        const total = Number(data.total ?? 0);
        const loaded = currentPage * pageSize;
        hasMore = total ? loaded < total : items.length === pageSize;

        if (btnMoreEl) btnMoreEl.disabled = !hasMore;
        currentPage += 1;

        setStatus("", "info");
      } catch (e) {
        const msg = String(e?.message || "");
        if ((e?.status === 401 || e?.status === 403) && !getApiKey()) {
          setStatus("Falta API Key. Pégala arriba y pulsa Guardar.", "error");
        } else {
          setStatus(`Error al cargar: ${msg}`, "error");
        }
      }
    },
    { overlayText: "Cargando tareas…", showOverlay: false }
  );

  const createIssueMultipart = withBusy(
    async () => {
      const form = document.querySelector("form");
      const submitBtn = form?.querySelector('button[type="submit"]');
      setButtonBusy(submitBtn, true, "Creando…");

      try {
        const title = (elTitle?.value || "").trim();
        const category = (elCategory?.value || "").trim();
        const description = (elDescription?.value || "").trim();
        const lat = (elLat?.value || "").trim();
        const lng = (elLng?.value || "").trim();

        // Validaciones amigables
        if (!lat || !lng) {
            // Intentamos llevar al usuario al mapa
            const mapContainer = document.getElementById("map");
            if (mapContainer) mapContainer.scrollIntoView({ behavior: "smooth", block: "center" });
            
            // Lanzamos error con mensaje claro
            throw new Error("⚠️ Debes hacer clic en el mapa para indicar dónde está la tarea.");
        }

        if (!title || !category || !description) {
          throw new Error(
            "Por favor, completa Título, Categoría y Descripción."
          );
        }

        const fd = new FormData();
        fd.set("title", title);
        fd.set("category", category);
        fd.set("description", description);
        fd.set("lat", lat);
        fd.set("lng", lng);

        // Foto
        if (elPhoto && elPhoto.files && elPhoto.files[0]) {
          fd.set("photo", elPhoto.files[0]);
        }
        // Documento
        if (elFile && elFile.files && elFile.files[0]) {
          fd.set("file", elFile.files[0]);
        }

        setStatus("Creando tarea…", "info");
        setLoading(true, "Creando tarea…");

        // Usa el helper común (incluye API key + credentials; y CSRF solo si procede)
        const data = await fetchJson(`${API_BASE}/issues`, {
          method: "POST",
          body: fd,
        });

        const createdId = data?.id;

        // limpiar formulario (mantengo category)
        if (elTitle) elTitle.value = "";
        if (elDescription) elDescription.value = "";
        if (elFile) elFile.value = "";
        if (elPhoto) elPhoto.value = "";
        updatePhotoPreview(null);
        updateDocPreview(null);

        setStatus("Tarea creada ✅", "ok");
        toast("Tarea creada ✅", "ok");

        // Recargar lista para ver la nueva tarea
        await loadIssues({ reset: true });

        // scroll a la tarjeta creada
        if (createdId != null) {
          markMine(createdId);
          setTimeout(() => {
            const el = document.getElementById(`issue-${createdId}`);
            if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
          }, 150);
        }
      } catch (e) {
        setLoading(false);
        setStatus(`Error al crear: ${e.message}`, "error");
        throw e;
      } finally {
        setButtonBusy(submitBtn, false);
      }
    },
    { overlayText: "Guardando…", showOverlay: true }
  );

  const setIssueStatus = withBusy(
    async (id, status) => {
      try {
        setLoading(true);
        await fetchJson(`${API_BASE}/issues/${id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ status }),
        });
        toast("Estado actualizado ✅", "ok");
        await loadIssues({ reset: true });
      } catch (e) {
        toast(`Error al actualizar: ${e.message}`, "error");
        setStatus(`Error al actualizar estado: ${e.message}`, "error");
      }
    },
    { overlayText: "Actualizando…", showOverlay: true }
  );

  const deleteIssue = withBusy(
    async (id) => {
      try {
        setLoading(true);
        await fetchJson(`${API_BASE}/issues/${id}`, { method: "DELETE" });
        setStatus("Tarea borrada ✅", "ok");
        toast("Tarea borrada ✅", "ok");
        await loadIssues({ reset: true });
      } catch (e) {
        setStatus(`Error al borrar: ${e.message}`, "error");
      }
    },
    { overlayText: "Borrando…", showOverlay: true }
  );

  // -------------------- init --------------------
  function wireUi() {
    ensureGlobalLoading();
    function clearFormAndMap() {
      try {
        if (elTitle) elTitle.value = "";
        if (elDescription) elDescription.value = "";

        // address input (inline)
        if (addrInlineEl) addrInlineEl.value = "";

        // coords
        if (elLat) elLat.value = "";
        if (elLng) elLng.value = "";

        // file + preview
        if (elFile) elFile.value = "";
        if (elPhoto) elPhoto.value = "";
        updatePhotoPreview(null);
        updateDocPreview(null);

        // remove pin + reset view
        if (markerPin && map) {
          try {
            map.removeLayer(markerPin);
          } catch {
            /* ignore */
          }
          markerPin = null;
        }
        if (map) {
          // Centro del plano [500, 500] con zoom inicial
          map.setView([500, 500], 0);
        }

        setStatus("", "info");
      } catch (e) {
        setStatus(`Limpiar: ${e.message}`, "error");
      }
    }

    // api key
    if (elApiKey) elApiKey.value = getApiKey();

    if (btnSaveKey) {
      btnSaveKey.addEventListener("click", async () => {
        setButtonBusy(btnSaveKey, true, "Guardando…");
        try {
          const v = (elApiKey?.value || "").trim();
          if (!v) {
            localStorage.removeItem(LS_API_KEY);
            setStatus("API key borrada.", "info");
            return;
          }
          localStorage.setItem(LS_API_KEY, v);
          setStatus("API key guardada ✅", "ok");
          toast("API key guardada ✅", "ok");
          await loadIssues({ reset: true });
        } finally {
          setButtonBusy(btnSaveKey, false);
        }
      });
    }

    // Theme Selector Logic
    const themeSelect = document.getElementById("themeSelect");
    if (themeSelect) {
        console.log("Theme selector found");
        // Load saved theme
        const savedTheme = localStorage.getItem("cola_theme") || "auto";
        console.log("Saved theme:", savedTheme);
        themeSelect.value = savedTheme;
        applyTheme(savedTheme);

        themeSelect.addEventListener("change", () => {
            const val = themeSelect.value;
            console.log("Theme changed to:", val);
            localStorage.setItem("cola_theme", val);
            applyTheme(val);
        });
    } else {
        console.warn("Theme selector NOT found in DOM");
    }

    function applyTheme(t) {
        let mode = t;
        if (t === "auto") {
            // Detectar preferencia del sistema
            const isLight = window.matchMedia("(prefers-color-scheme: light)").matches;
            mode = isLight ? "light" : "dark";
            console.log("Auto mode detected system preference:", mode);
        }
        console.log("Applying theme mode:", mode);
        document.documentElement.setAttribute("data-theme", mode);
    }

    // Listener para cambios en preferencia de sistema (solo si está en auto)
    window.matchMedia("(prefers-color-scheme: light)").addEventListener("change", () => {
        const currentSetting = localStorage.getItem("cola_theme") || "auto";
        if (currentSetting === "auto") applyTheme("auto");
    });

    // refrescar listado
    if (btnRefresh) {
      btnRefresh.addEventListener("click", (ev) => {
        ev.preventDefault();
        loadIssues({ reset: true }).catch(() => {});
      });
    }

    // limpiar formulario + mapa
    if (btnClear) {
      btnClear.addEventListener("click", (ev) => {
        ev.preventDefault();
        clearFormAndMap();
      });
    }

    // Buscar dirección (input inline del formulario): abre modal al click/focus y sincroniza al escribir
    addrInlineEl =
      document.querySelector("#addr") ||
      document.querySelector("#address") ||
      document.querySelector("#addrQuery") ||
      document.querySelector("input[name='addr']") ||
      document.querySelector("input[name='address']") ||
      document.querySelector("input[placeholder*='Buscar direcci']");

    // crear tarea: enganchar al form si existe
    const form = document.querySelector("form");
    if (form) {
      form.addEventListener("submit", async (ev) => {
        ev.preventDefault();
        await createIssueMultipart();
      });
    } else {
      const btnCreate = document.querySelector("#btnCreate");
      if (btnCreate) {
        btnCreate.addEventListener("click", async (ev) => {
          ev.preventDefault();
          setLoading(false);
          await createIssueMultipart();
        });
      }
    }

    // Edit Modal File Previews
    const dmResPhoto = document.getElementById("dmResPhotoInput");
    if (dmResPhoto) {
        dmResPhoto.addEventListener("change", () => {
            const f = dmResPhoto.files[0];
            const p = document.getElementById("dmResPhotoPreview");
            if (p) p.textContent = f ? `Seleccionado: ${f.name}` : "";
        });
    }
    const dmResDoc = document.getElementById("dmResDocInput");
    if (dmResDoc) {
        dmResDoc.addEventListener("change", () => {
            const f = dmResDoc.files[0];
            const p = document.getElementById("dmResDocPreview");
            if (p) p.textContent = f ? `Seleccionado: ${f.name}` : "";
        });
    }
    
    // Edit Modal Original Replace Previews
    const dmEditPhoto = document.getElementById("dmEditPhotoInput");
    if (dmEditPhoto) {
        dmEditPhoto.addEventListener("change", () => {
            const f = dmEditPhoto.files[0];
            const p = document.getElementById("dmEditPhotoPreview");
            if (p) p.textContent = f ? `Sustituir por: ${f.name}` : "";
        });
    }
    const dmEditDoc = document.getElementById("dmEditDocInput");
    if (dmEditDoc) {
        dmEditDoc.addEventListener("change", () => {
            const f = dmEditDoc.files[0];
            const p = document.getElementById("dmEditDocPreview");
            if (p) p.textContent = f ? `Sustituir por: ${f.name}` : "";
        });
    }

    ensureFiltersBar();

    // Delegación global: por si los botones cambian/están dentro de overlays, etc.
    // Captura el click en fase CAPTURE para evitar que otros listeners lo paren.
    document.addEventListener(
      "click",
      (ev) => {
        const t = ev.target;
        if (!t) return;
        const refreshBtn = t.closest?.("#btnRefresh");
        const clearBtn = t.closest?.("#btnClear");

        if (refreshBtn) {
          ev.preventDefault();
          setStatus("Refrescando…", "info");
          loadIssues({ reset: true }).catch((e) =>
            setStatus(`Error al refrescar: ${e.message}`, "error")
          );
          return;
        }

      },
      true
    );
  }

  async function boot() {
    try {
      wireUi();
      ensureMap();
      await getConfig();
      await loadCategories();
      await loadIssues({ reset: true });
    } catch (e) {
      setStatus(`Boot error: ${e.message}`, "error");
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      boot().catch(() => {});
    });
  } else {
    boot().catch(() => {});
  }
})();
