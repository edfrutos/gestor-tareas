import { API_BASE, LS_API_KEY } from "./config.js";

function isMutating(m) {
  const mm = String(m || "GET").toUpperCase();
  return ["POST", "PUT", "PATCH", "DELETE"].includes(mm);
}

export function getApiKey() {
  return (localStorage.getItem(LS_API_KEY) || "").trim();
}

// CSRF cache
let csrfToken = null;
let csrfUnavailable = false;
let csrfInFlight = null;
let csrfRetryAfterAt = 0;
let csrfFailureCount = 0;

async function getCsrfToken() {
  if (csrfToken) return csrfToken;
  if (csrfUnavailable) return null;
  const csrfEnabled = localStorage.getItem("csrfEnabled");
  if (csrfEnabled === "0") return null;

  const now = Date.now();
  if (csrfRetryAfterAt && now < csrfRetryAfterAt) return null;
  if (csrfInFlight) return csrfInFlight;

  const attemptFetch = async () => {
    const res = await fetch(`${API_BASE}/csrf`, {
      method: "GET",
      credentials: "include",
      headers: { accept: "application/json" },
    });
    if ([204, 404, 501].includes(res.status)) {
      csrfUnavailable = true;
      return null;
    }
    if (!res.ok) throw new Error(`CSRF HTTP ${res.status}`);
    const data = await res.json().catch(() => null);
    if (!data?.token) throw new Error("CSRF token missing");
    csrfToken = data.token;
    csrfFailureCount = 0;
    csrfRetryAfterAt = 0;
    return csrfToken;
  };

  csrfInFlight = (async () => {
    for (let i = 1; i <= 3; i++) {
      try { return await attemptFetch(); }
      catch {
        if (csrfUnavailable) return null;
        csrfFailureCount = Math.min(csrfFailureCount + 1, 20);
        if (i === 3) {
          csrfRetryAfterAt = Date.now() + Math.min(30000, 250 * Math.pow(2, Math.max(0, csrfFailureCount - 1)));
          return null;
        }
        await new Promise(r => setTimeout(r, 250 * Math.pow(2, i - 1) + Math.random() * 125));
      }
    }
    return null;
  })().finally(() => { csrfInFlight = null; });
  
  return csrfInFlight;
}

export async function getConfig() {
  try {
    const res = await fetch(`${API_BASE}/config`, { credentials: "include" });
    if (!res.ok) return;
    const cfg = await res.json().catch(() => ({}));
    localStorage.setItem("csrfEnabled", cfg.csrfEnabled === true ? "1" : (cfg.csrfEnabled === false ? "0" : ""));
  } catch (e) {
    console.warn("getConfig error:", e);
  }
}

export async function fetchJson(url, opts = {}) {
  const headers = new Headers(opts.headers || {});
  headers.set("accept", "application/json");

  const key = getApiKey();
  if (key) headers.set("x-api-key", key);

  const method = String(opts.method || "GET").toUpperCase();
  if (isMutating(method)) {
    const token = await getCsrfToken();
    if (token) headers.set("x-csrf-token", token);
  }

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
    if (err.name === 'AbortError') throw new Error("Timeout: La petición tardó demasiado.");
    throw err;
  }
}
