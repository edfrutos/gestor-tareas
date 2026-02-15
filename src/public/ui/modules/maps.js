import { API_BASE } from "./config.js";
import { fetchJson, fetchUpload } from "./api.js";
import { state } from "./store.js";
import { $, toast, setButtonBusy, safeText } from "./utils.js";
import { loadIssues } from "./list.v2.js";
import { getUser } from "./auth.js";

let showArchived = false;

// Inicializar
export function initMapsModule() {
  const btnMaps = $("#btnMaps");
  if (btnMaps) {
    btnMaps.onclick = openMapsModal;
  }

  const modal = $("#mapsModal");
  const close = $("#mapsClose");
  if (close && modal) {
    close.onclick = () => modal.style.display = "none";
    modal.onclick = (e) => { if (e.target === modal) modal.style.display = "none"; };
  }

  const form = $("#uploadMapForm");
  if (form) {
    // Inyectar checkbox de archivados si no existe
    if (!$("#chkShowArchived")) {
      const chkWrap = document.createElement("div");
      chkWrap.style.cssText = "margin-top:10px; display:flex; align-items:center; gap:8px; font-size:12px; color:var(--muted);";
      chkWrap.innerHTML = `<label style="display:flex; align-items:center; gap:6px; cursor:pointer;"><input type="checkbox" id="chkShowArchived"> Ver planos archivados</label>`;
      form.after(chkWrap);
      
      $("#chkShowArchived").onchange = (e) => {
        showArchived = e.target.checked;
        loadAndRenderMaps();
      };
    }

    form.onsubmit = async (e) => {
      e.preventDefault();
      const fileInput = $("#mapFile");
      const nameInput = $("#mapName");
      const btn = form.querySelector("button[type=submit]");

      if (!fileInput.files[0]) return toast("Selecciona una imagen", "warn");

      setButtonBusy(btn, true, "Subiendo...");
      try {
        const formData = new FormData();
        formData.append("map", fileInput.files[0]);
        formData.append("name", nameInput.value.trim() || "Sin título");

        await fetchUpload(`${API_BASE}/maps`, {
          method: "POST",
          body: formData
        });

        toast("Plano subido correctamente", "ok");
        form.reset();
        await loadAndRenderMaps();
      } catch (err) {
        toast(err.message, "error");
      } finally {
        setButtonBusy(btn, false);
      }
    };
  }
}

// Cargar lista de mapas
export async function loadMaps(includeArchived = false) {
  try {
    const list = await fetchJson(`${API_BASE}/maps?include_archived=${includeArchived}`);
    state.mapsList = list || [];
    
    // Si no hay mapa activo, seleccionar el primero (por defecto ID 1)
    if (!state.currentMap && state.mapsList.length > 0) {
      // Intentar buscar el ID 1, si no el primero
      const def = state.mapsList.find(m => m.id === 1) || state.mapsList[0];
      selectMap(def, false); // false = no recargar issues todavía
    }
  } catch (err) {
    console.error("Error cargando mapas:", err);
  }
}

async function loadAndRenderMaps() {
  await loadMaps(showArchived);
  renderMapsList();
}

export function openMapsModal() {
  const modal = $("#mapsModal");
  if (!modal) return;
  modal.style.display = "flex";
  loadAndRenderMaps();
}

function renderMapsList() {
  const container = $("#mapsList");
  if (!container) return;
  container.innerHTML = "";

  const currentUser = getUser();
  const isAdmin = currentUser?.role === 'admin';

  if (state.mapsList.length === 0) {
    container.innerHTML = `<div style="padding:20px; text-align:center; color:var(--muted);">No hay planos disponibles.</div>`;
    return;
  }

  state.mapsList.forEach(m => {
    const el = document.createElement("div");
    el.className = "map-item";
    el.style.cssText = `
      display: flex; align-items: center; gap: 10px; 
      padding: 10px; border-bottom: 1px solid var(--border2);
      background: ${state.currentMap?.id === m.id ? 'var(--chip2)' : 'transparent'};
      opacity: ${m.archived ? '0.5' : '1'};
    `;

    const isMine = currentUser && m.created_by === currentUser.id;
    const canManage = isAdmin || isMine;
    // No permitir borrar/archivar el ID 1 (sistema)
    const isSystem = m.id === 1;

    el.innerHTML = `
      <img src="${m.thumb_url || m.file_url}" style="width:60px; height:40px; object-fit:cover; border-radius:4px; background:#000;">
      <div style="flex:1; min-width:0;">
        <div style="font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
          ${m.archived ? '📦 ' : ''}${safeText(m.name)}
        </div>
        <div style="font-size:11px; color:var(--muted);">
           ${m.created_by_username ? `Por ${safeText(m.created_by_username)}` : 'Sistema'}
        </div>
      </div>
      <div style="display:flex; gap:6px;">
        <button class="btn small btn-select-map" style="${state.currentMap?.id === m.id ? 'background:var(--ok); color:#fff; border:none;' : ''}">
          ${state.currentMap?.id === m.id ? 'Activo' : 'Usar'}
        </button>
        ${canManage && !isSystem ? `
          <button class="btn small btn-archive-map" title="${m.archived ? 'Desarchivar' : 'Archivar'}">
            ${m.archived ? '📤' : '📦'}
          </button>
          <button class="btn small danger btn-del-map">🗑️</button>
        ` : ''}
      </div>
    `;

    el.querySelector(".btn-select-map").onclick = () => {
      selectMap(m);
      renderMapsList(); // Re-render para actualizar botones
    };

    if (canManage && !isSystem) {
      el.querySelector(".btn-del-map").onclick = () => deleteMap(m.id);
      el.querySelector(".btn-archive-map").onclick = () => archiveMap(m.id, !m.archived);
    }

    container.appendChild(el);
  });
}

export function selectMap(map, reloadIssuesFlag = true) {
  if (!map) return;
  state.currentMap = map;
  
  // Actualizar UI del mapa principal
  const mapTitle = $("#mapTitle");
  if (mapTitle) mapTitle.textContent = `🗺️ ${map.name}`;

  // Despachamos evento al document
  document.dispatchEvent(new CustomEvent("mapChanged", { detail: map }));

  if (reloadIssuesFlag) {
    loadIssues({ reset: true });
  }
}

async function archiveMap(id, archive) {
  try {
    await fetchJson(`${API_BASE}/maps/${id}/archive`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived: archive })
    });
    toast(archive ? "Plano archivado" : "Plano restaurado", "ok");
    await loadAndRenderMaps();
  } catch (err) {
    toast(err.message, "error");
  }
}

async function deleteMap(id) {
  if (!confirm("¿Borrar este plano? Las incidencias asociadas podrían perder su referencia.")) return;
  
  try {
    await fetchJson(`${API_BASE}/maps/${id}`, { method: "DELETE" });
    toast("Plano eliminado", "ok");
    
    // Si borramos el activo, volver al default
    if (state.currentMap?.id === id) {
      state.currentMap = null; // forzar selección
    }
    
    await loadAndRenderMaps();
  } catch (err) {
    toast(err.message, "error");
  }
}
