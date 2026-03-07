// Centro de notificaciones: actividad en tareas creadas o asignadas
import { API_BASE } from "./config.js";
import { fetchJson } from "./api.js";
import { $, safeText } from "./utils.js";
import { openDetailModal } from "./details.v2.js";
import { loadIssues } from "./list.v2.js";

const LABELS = {
  comment: "💬 Comentario",
  reply: "↳ Respuesta",
  log: "📋 Cambio",
  update_status: "Estado",
  assign: "Asignación",
  update_priority: "Prioridad",
  update_due_date: "Fecha límite",
  update_description: "Descripción",
  update_category: "Categoría",
};

function formatLogAction(action, oldVal, newVal) {
  if (action === "update_status") {
    const s = { open: "Abierta", in_progress: "En curso", resolved: "Resuelta" };
    return `${s[oldVal] || oldVal} → ${s[newVal] || newVal}`;
  }
  if (action === "assign") return newVal ? "Tarea asignada" : "Asignación quitada";
  if (action === "update_priority") {
    const p = { low: "Baja", medium: "Media", high: "Alta", critical: "Crítica" };
    return `${p[oldVal] || oldVal} → ${p[newVal] || newVal}`;
  }
  if (action === "update_due_date") return newVal ? `→ ${newVal}` : "Quitada";
  return newVal ? `${oldVal || "—"} → ${newVal}` : "";
}

export async function showNotificationsModal() {
  const modal = $("#notificationsModal");
  if (!modal) return;

  const list = $("#notificationsList");
  if (!list) return;

  list.innerHTML = "<div style='text-align:center; padding:20px; opacity:0.7;'>Cargando…</div>";
  modal.style.display = "flex";

  try {
    const data = await fetchJson(`${API_BASE}/notifications`);
    const items = data?.items || [];

    if (items.length === 0) {
      list.innerHTML = `
        <div style="text-align:center; padding:30px; color:var(--muted); font-size:14px;">
          <p style="margin:0 0 8px 0;">📭 Sin notificaciones</p>
          <p style="margin:0; font-size:12px;">Verás aquí comentarios, respuestas y cambios en tus tareas.</p>
        </div>
      `;
      return;
    }

    list.innerHTML = items
      .map((n) => {
        const date = new Date(n.created_at).toLocaleString();
        let content = "";
        let icon = "📌";

        if (n.type === "comment" || n.type === "reply") {
          icon = n.type === "reply" ? "↳" : "💬";
          content = `<strong>@${safeText(n.commenter_username)}</strong> ${n.type === "reply" ? "respondió" : "comentó"}: "${safeText(n.text_preview || "")}"`;
        } else if (n.type === "log") {
          icon = "📋";
          const label = LABELS[n.action] || n.action;
          content = `${label}: ${formatLogAction(n.action, n.old_value, n.new_value)}`;
        }

        return `
          <div class="notification-item" data-issue-id="${n.issue_id}" style="padding:12px 14px; border-bottom:1px solid var(--border2); cursor:pointer; transition:background 0.15s;"
               onmouseover="this.style.background='var(--panel2)'" onmouseout="this.style.background='transparent'">
            <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
              <span style="font-size:11px; color:var(--muted);">${icon} ${safeText(n.issue_title || "Tarea")}</span>
              <span style="font-size:10px; color:var(--muted);">${date}</span>
            </div>
            <div style="font-size:13px; line-height:1.4;">${content}</div>
          </div>
        `;
      })
      .join("");

    list.querySelectorAll(".notification-item").forEach((el) => {
      el.onclick = async () => {
        const issueId = Number(el.dataset.issueId);
        modal.style.display = "none";
        if (!issueId) return;
        const { fetchJson: fetchJsonApi } = await import("./api.js");
        const { state } = await import("./store.js");
        try {
          const it = await fetchJsonApi(`${API_BASE}/issues/${issueId}`);
          if (it) {
            const { selectMap } = await import("./maps.js");
            if (it.map_id && (!state.currentMap || state.currentMap.id !== it.map_id)) {
              const maps = state.mapsList || [];
              let targetMap = maps.find((m) => m.id === it.map_id);
              if (!targetMap) {
                try {
                  targetMap = await fetchJsonApi(`${API_BASE}/maps/${it.map_id}`);
                  if (targetMap) state.mapsList = [...(state.mapsList || []), targetMap];
                } catch {}
              }
              if (targetMap) await selectMap(targetMap, false);
            }
            await loadIssues({ reset: true });
            openDetailModal(it);
          }
        } catch (e) {
          console.warn("Error loading issue for notification:", e);
        }
      };
    });
  } catch (e) {
    list.innerHTML = `<div style="color:var(--bad); padding:20px; text-align:center;">Error al cargar: ${safeText(e?.message || "Error")}</div>`;
  }
}

export function initNotificationsModule() {
  const btn = $("#btnNotifications");
  const closeBtn = $("#notificationsClose");
  const modal = $("#notificationsModal");

  if (btn) btn.onclick = () => showNotificationsModal();
  if (closeBtn) closeBtn.onclick = () => { if (modal) modal.style.display = "none"; };
  if (modal) modal.onclick = (e) => { if (e.target === modal) modal.style.display = "none"; };
}
