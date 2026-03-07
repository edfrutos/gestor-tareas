import { API_BASE, LS_API_KEY } from "./config.js";
import { fetchJson } from "./api.js";

const LS_TOKEN = "cc_token";
const LS_USER = "cc_user";

export function getToken() {
  return localStorage.getItem(LS_TOKEN);
}

export function getUser() {
  const u = localStorage.getItem(LS_USER);
  try { return u ? JSON.parse(u) : null; } catch { return null; }
}

export async function login(username, password) {
  // Login sin auth (público)
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    credentials: "include",
    body: JSON.stringify({ username, password })
  });

  const data = res.ok ? await res.json().catch(() => ({})) : null;
  if (!res.ok) {
    const err = data?.error || new Error("Usuario o contraseña incorrectos");
    throw typeof err === "string" ? new Error(err) : new Error(err.message || "Error en login");
  }

  if (data?.token) {
    localStorage.setItem(LS_TOKEN, data.token);
    localStorage.setItem(LS_USER, JSON.stringify(data.user || {}));

    // Tras login: obtener API_KEY del servidor (desde .env) si no hay en localStorage
    try {
      const apiRes = await fetch(`${API_BASE}/auth/me/apikey`, {
        headers: { "Authorization": `Bearer ${data.token}`, "Accept": "application/json" },
        credentials: "include"
      });
      if (apiRes.ok) {
        const { apiKey } = await apiRes.json().catch(() => ({}));
        if (apiKey) localStorage.setItem(LS_API_KEY, apiKey);
      }
    } catch (_e) { /* ignorar si falla */ }

    return data.user;
  }
  throw new Error("Error en la respuesta de autenticación");
}

export async function register(username, password, email) {
  return await fetchJson(`${API_BASE}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password, email })
  });
}

export async function updateProfile({ currentPassword, newPassword, email }) {
  return await fetchJson(`${API_BASE}/auth/me`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ currentPassword, newPassword, email })
  });
}

export async function changePassword(currentPassword, newPassword) {
  return await fetchJson(`${API_BASE}/auth/me/password`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ currentPassword, newPassword })
  });
}

export function logout() {
  localStorage.removeItem(LS_TOKEN);
  localStorage.removeItem(LS_USER);
  localStorage.removeItem(LS_API_KEY);
  location.reload();
}

export function isAuthenticated() {
  return !!getToken() || !!(localStorage.getItem(LS_API_KEY) || "").trim();
}
