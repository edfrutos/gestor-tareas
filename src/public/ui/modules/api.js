import { API_BASE, LS_API_KEY } from "./config.js";
import { getToken } from "./auth.js";

function isMutating(m) {
  const mm = String(m || "GET").toUpperCase();
  return ["POST", "PUT", "PATCH", "DELETE"].includes(mm);
}

export function getApiKey() {
  return (localStorage.getItem(LS_API_KEY) || "").trim();
}

export async function getIssueLogs(id) {
  return await fetchJson(`${API_BASE}/issues/${id}/logs`);
}

export async function getConfig() {
  try {
    const res = await fetch(`${API_BASE}/config`, { credentials: "include" });
    if (!res.ok) return;
    const cfg = await res.json().catch(() => ({}));
    localStorage.setItem("csrfEnabled", cfg.csrfEnabled === true ? "1" : "0");
  } catch (e) {
    console.warn("getConfig error:", e);
  }
}

export async function fetchJson(url, opts = {}) {
  const headers = new Headers(opts.headers || {});
  headers.set("accept", "application/json");

  const token = getToken();
  if (token) headers.set("authorization", `Bearer ${token}`);

  const key = getApiKey();
  if (key && !token) headers.set("x-api-key", key);

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

export async function fetchUpload(url, opts = {}) {
  const headers = new Headers(opts.headers || {});
  headers.set("accept", "application/json");

  const token = getToken();
  if (token) headers.set("authorization", `Bearer ${token}`);

  const key = getApiKey();
  if (key && !token) headers.set("x-api-key", key);

  try {
    const res = await fetch(url, {
      ...opts,
      credentials: "include",
      headers,
    });

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
    throw err;
  }
}
