/* global io */
import { loadIssues } from "./list.v2.js";
import { toast } from "./utils.js";

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

  socket = io();

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

  socket.on("disconnect", () => {
    console.log("[Socket] Disconnected from server");
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
