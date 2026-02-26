import { loadIssues } from "./list.v2.js";
import { toast } from "./utils.js";

let socket = null;

export function initSocketModule() {
  if (typeof io === "undefined") {
    console.error("[Socket] io is not defined. Script not loaded?");
    return;
  }

  socket = io();

  socket.on("connect", () => {
    console.log("[Socket] Connected to server");
  });

  socket.on("issue:created", (data) => {
    console.log("[Socket] Issue created:", data);
    toast(`Nueva tarea: ${data.title}`, "info");
    refreshAll();
  });

  socket.on("issue:updated", (data) => {
    console.log("[Socket] Issue updated:", data);
    refreshAll();
  });

  socket.on("issue:deleted", (data) => {
    console.log("[Socket] Issue deleted:", data);
    refreshAll();
  });

  socket.on("disconnect", () => {
    console.log("[Socket] Disconnected from server");
  });
}

async function refreshAll() {
  // Recargar la lista de tareas
  loadIssues({ reset: false }).catch(e => console.error("[Socket] Error reloading issues:", e));
  
  // Recargar las estadísticas (contadores del header)
  try {
    const { updateStats } = await import("./stats.js");
    if (updateStats) updateStats();
  } catch (err) {
    console.error("[Socket] Error importing stats module:", err);
  }
}
