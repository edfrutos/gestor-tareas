import { state } from "./store.js";

// DOM selector corto
export const $ = (sel) => document.querySelector(sel);

export function safeText(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function statusLabel(st) {
  switch (String(st)) {
    case "open": return "Abierta";
    case "in_progress": return "En curso";
    case "resolved": return "Resuelta";
    default: return String(st || "");
  }
}

export function catColor(cat) {
  const c = String(cat || "").toLowerCase();
  if (c.includes("alumbr")) return "#3b82f6";
  if (c.includes("bache")) return "#f97316";
  if (c.includes("basur")) return "#22c55e";
  if (c.includes("agua")) return "#06b6d4";
  if (c.includes("ruido")) return "#a855f7";
  return "#94a3b8";
}

export function resolveSameOriginUrl(u) {
  const s = String(u || "").trim();
  if (!s) return "";
  if (s.startsWith("/")) return s;
  try {
    const parsed = new URL(s, window.location.origin);
    if (parsed.origin === window.location.origin) {
      return parsed.pathname + parsed.search + parsed.hash;
    }
    const hn = (parsed.hostname || "").toLowerCase();
    if (hn === "localhost" || hn === "127.0.0.1" || hn.endsWith(".localhost")) {
      return parsed.pathname + parsed.search + parsed.hash;
    }
    return s;
  } catch {
    return s;
  }
}

export function setImgFallback(img, { fallbackSrc = "", onFailReplace = true } = {}) {
  if (!img) return;
  try { img.loading = "lazy"; img.decoding = "async"; } catch {} // hints

  const handler = () => {
    if (fallbackSrc && img.getAttribute("data-fallback-used") !== "1") {
      img.setAttribute("data-fallback-used", "1");
      img.src = fallbackSrc;
      return;
    }
    if (onFailReplace) {
      const ph = document.createElement("div");
      ph.className = "noimg";
      ph.textContent = "sin foto";
      img.replaceWith(ph);
    }
  };
  img.removeEventListener("error", handler); // evitar dupes si se reusa elemento
  img.addEventListener("error", handler, { once: false });
}

// --- UI Feedback ---

export function setStatus(msg, kind = "info") {
  const el = $("#status");
  if (!el) return;
  el.textContent = msg || "";
  el.dataset.kind = kind;
}

// Toasts
let toastHost = null;
function ensureToasts() {
  if (toastHost) return toastHost;
  toastHost = document.getElementById("toastHost");
  if (toastHost) return toastHost;

  const el = document.createElement("div");
  el.id = "toastHost";
  el.style.cssText = "position:fixed;right:14px;bottom:14px;display:flex;flex-direction:column;gap:10px;z-index:12000;max-width:min(420px,calc(100vw - 28px));";
  document.body.appendChild(el);
  toastHost = el;
  return toastHost;
}

export function toast(msg, kind = "info", ttl = 2600) {
  const host = ensureToasts();
  const t = document.createElement("div");
  const border = kind === "ok" ? "rgba(34,197,94,.55)" : kind === "warn" ? "rgba(245,158,11,.55)" : kind === "error" ? "rgba(239,68,68,.55)" : "rgba(148,163,184,.45)";

  t.style.cssText = `background:rgba(17,17,17,.92);border:1px solid ${border};border-radius:14px;padding:10px 12px;box-shadow:0 18px 60px rgba(0,0,0,.35);backdrop-filter:blur(6px);color:#fff;display:flex;gap:10px;align-items:flex-start;opacity:0;transform:translateY(6px);transition:opacity .18s ease, transform .18s ease;`;
  t.innerHTML = `<div style="flex:1;font-size:13px;line-height:1.3;">${safeText(msg)}</div><button class="btn small" style="padding:4px 8px;line-height:1;opacity:.85;">✕</button>`;

  const close = () => {
    if (!t.isConnected) return;
    t.style.opacity = "0";
    t.style.transform = "translateY(6px)";
    setTimeout(() => t.remove(), 180);
  };
  t.querySelector("button").onclick = close;
  host.appendChild(t);
  
  requestAnimationFrame(() => { t.style.opacity = "1"; t.style.transform = "translateY(0)"; });
  setTimeout(close, ttl);
}

// Busy Overlay
let globalLoadingEl = null;
function ensureGlobalLoading() {
  if (globalLoadingEl) return;
  globalLoadingEl = document.getElementById("globalLoading");
  if (globalLoadingEl) return;
  
  const el = document.createElement("div");
  el.id = "globalLoading";
  el.setAttribute("aria-hidden", "true");
  el.style.cssText = "position:fixed;inset:0;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.28);z-index:11000;backdrop-filter:saturate(120%) blur(2px);";
  el.innerHTML = `<div style="display:flex;flex-direction:column;gap:10px;align-items:center;"><div style="width:38px;height:38px;border-radius:999px;border:3px solid rgba(255,255,255,.35);border-top-color:#fff;animation:spin 0.9s linear infinite;"></div><div id="globalLoadingText" style="color:#fff;font-weight:600;text-shadow:0 2px 18px rgba(0,0,0,.35);">Cargando…</div></div><style>@keyframes spin { from { transform: rotate(0deg);} to { transform: rotate(360deg);} }</style>`;
  document.body.appendChild(el);
  globalLoadingEl = el;
}

export function setGlobalLoading(on, text = "Cargando…") {
  ensureGlobalLoading();
  const t = globalLoadingEl.querySelector("#globalLoadingText");
  if (t) t.textContent = text;
  globalLoadingEl.style.display = on ? "flex" : "none";
  globalLoadingEl.setAttribute("aria-hidden", on ? "false" : "true");
  state.isLoading = !!on;
  document.body.dataset.loading = on ? "1" : "0";
}

export function setButtonBusy(btn, busy, labelBusy = "Cargando…") {
  if (!btn) return;
  const current = Number(btn.dataset.busyCount || 0);
  if (busy) {
    if (!btn.dataset.labelIdle) btn.dataset.labelIdle = btn.textContent;
    btn.dataset.busyCount = String(current + 1);
    btn.disabled = true;
    btn.classList.add("busy");
    btn.textContent = labelBusy;
  } else {
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
}

export function setControlsDisabled(disabled) {
  const submitBtn = document.querySelector('form button[type="submit"]');
  // Se asume que estos elementos existen en el DOM o se ignoran si no
  const toDisable = [
    $("#btnRefresh"), $("#btnClear"), $("#btnLocate"), $("#btnSaveKey"), 
    $("#btnMore"), $("#btnAddr"), submitBtn
  ].filter(Boolean);

  toDisable.forEach((el) => {
    try {
      el.disabled = !!disabled;
      el.style.opacity = disabled ? "0.6" : "";
      el.style.pointerEvents = disabled ? "none" : "";
    } catch {}
  });
  
  const listEl = $("#list");
  if (listEl) {
    listEl.querySelectorAll("button").forEach(el => el.disabled = !!disabled);
  }
}

export function withBusy(fn, { overlayText = "Cargando…", showOverlay = true, disableControls = true } = {}) {
  return async (...args) => {
    state.busyCount++;
    if (state.busyCount === 1) {
      if (showOverlay) setGlobalLoading(true, overlayText);
      if (disableControls) setControlsDisabled(true);
    }
    try {
      return await fn(...args);
    } finally {
      state.busyCount = Math.max(0, state.busyCount - 1);
      if (state.busyCount === 0) {
        if (showOverlay) setGlobalLoading(false);
        if (disableControls) setControlsDisabled(false);
      }
    }
  };
}
