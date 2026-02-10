import { fetchJson } from "./api.js";

const POLLING_INTERVAL = 30000; // 30 segundos
let pollingTimer = null;
let lastStats = { open: 0, in_progress: 0, resolved: 0 };

function updateBadge(id, count, lastCount) {
  const el = document.getElementById(id);
  if (!el) return;
  
  if (count > 0) {
    el.textContent = count;
    el.style.display = "inline-flex";
    
    // Animación simple si cambia el número
    if (count !== lastCount) {
      el.style.transform = "scale(1.2)";
      setTimeout(() => el.style.transform = "scale(1)", 200);
    }
  } else {
    el.style.display = "none";
  }
}

export async function updateStats() {
  try {
    const stats = await fetchJson("/v1/issues/stats");
    if (!stats) return;

    // Actualizar cada badge por separado
    updateBadge("badgeOpen", stats.open || 0, lastStats.open);
    updateBadge("badgeProgress", stats.in_progress || 0, lastStats.in_progress);
    updateBadge("badgeResolved", stats.resolved || 0, lastStats.resolved);

    lastStats = { ...stats };
  } catch (err) {
    // Silencioso en error de red, reintentará en el siguiente tick
    // console.warn("Error fetching stats:", err);
  }
}

export function startStatsPolling() {
  updateStats(); // Primera llamada inmediata
  if (pollingTimer) clearInterval(pollingTimer);
  pollingTimer = setInterval(updateStats, POLLING_INTERVAL);
}
