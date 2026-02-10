import { API_BASE } from "./config.js";
import { fetchJson } from "./api.js";

const LS_TOKEN = "cc_token";
const LS_USER = "cc_user";

export function getToken() {
  return localStorage.getItem(LS_TOKEN);
}

export function getUser() {
  const u = localStorage.getItem(LS_USER);
  try { return u ? JSON.parse(u) : null; } catch(e) { return null; }
}

export async function login(username, password) {
  const res = await fetchJson(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });

  if (res.token) {
    localStorage.setItem(LS_TOKEN, res.token);
    localStorage.setItem(LS_USER, JSON.stringify(res.user));
    return res.user;
  }
  throw new Error("Error en la respuesta de autenticación");
}

export async function register(username, password) {
  return await fetchJson(`${API_BASE}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
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
  location.reload();
}

export function isAuthenticated() {
  return !!getToken();
}
