/* global io */
import { loadIssues } from "./list.v2.js";
import { toast } from "./utils.js";
import { getToken } from "./auth.js";

let socket = null;

export function initSocketModule() {
  if (typeof io === "undefined") {
    console.error("[Socket] io is not defined. Script not loaded?");
    return;
  }

  if (socket?.connected) {
    return;
  }

  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
  }

  // Función (no objeto) para que cada reconexión use el token vigente, p. ej.
  // el nuevo tras cambiar la contraseña.
  socket = io({ auth: (cb) => cb({ token: getToken() }) });

  let debounceTimer = null;
  const DEBOUNCE_MS = 200;
  const debouncedRefreshAll = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      refreshAll();
    }, DEBOUNCE_MS);
  };

  socket.on("connect", () => {
    console.log("[Socket] Connected to server");
  });

  socket.on("connect_error", (err) => {
    console.error("[Socket] Connection error:", err.message);
  });

  socket.on("issue:created", (data) => {
    console.log("[Socket] Issue created:", data);
    toast(`Nueva tarea: ${data.title}`, "info");
    debouncedRefreshAll();
  });

  socket.on("issue:updated", (data) => {
    console.log("[Socket] Issue updated:", data);
    debouncedRefreshAll();
  });

  socket.on("issue:deleted", (data) => {
    console.log("[Socket] Issue deleted:", data);
    debouncedRefreshAll();
  });

  socket.on("disconnect", (reason) => {
    console.log("[Socket] Disconnected from server");
    // El servidor cierra los sockets de un usuario al revocar sus sesiones.
    // Socket.io no reconecta solo en ese caso: reintentamos con el token
    // actual (si también está revocado, el handshake lo rechazará).
    if (reason === "io server disconnect" && getToken()) socket.connect();
  });
}

async function refreshAll() {
  try {
    await loadIssues({ reset: false });
  } catch (e) {
    console.error("[Socket] Error reloading issues:", e);
  }

  try {
    const { updateStats } = await import("./stats.js");
    if (updateStats) updateStats();
  } catch (err) {
    console.error("[Socket] Error importing stats module:", err);
  }
}
