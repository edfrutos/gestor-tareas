import { getToken, getUser } from "./auth.js";
import { state, isFav, toggleFav } from "./store.js";
import { API_BASE } from "./config.js";
import { fetchJson, getIssueLogs } from "./api.js";
import { $, safeText, statusLabel, resolveSameOriginUrl, setImgFallback, withBusy, setButtonBusy, toast } from "./utils.js";
import { setLatLng } from "./map.js";
import { showDocModal } from "./modals.js";
import { loadIssues } from "./list.v2.js";

let currentDetailId = null;

function renderHistory(logs) {
  const container = $("#dmHistoryItems");
  if (!container) return;
  container.innerHTML = "";

  if (!logs || logs.length === 0) {
    container.innerHTML = "<span style='color:var(--muted); font-style:italic;'>Sin cambios registrados.</span>";
    return;
  }

  logs.forEach(log => {
    const date = new Date(log.created_at).toLocaleString();
    let text = `Acción: ${log.action}`;
    let icon = "🔹";

    switch(log.action) {
      case "create":
        text = "Tarea creada";
        icon = "✨";
        break;
      case "update_status":
        text = `Estado: ${translateStatus(log.old_value)} ➝ <strong>${translateStatus(log.new_value)}</strong>`;
        icon = "🔄";
        break;
      case "update_description":
        text = "Descripción actualizada";
        icon = "📝";
        break;
      case "update_category":
        text = `Categoría: ${log.old_value} ➝ <strong>${log.new_value}</strong>`;
        icon = "🏷️";
        break;
      case "update_map":
        text = `Plano cambiado`;
        icon = "🗺️";
        break;
      case "update_photo":
        text = "Foto actualizada";
        icon = "📷";
        break;
      case "update_doc":
        text = "Documento actualizado";
        icon = "📄";
        break;
      case "resolution_photo":
        text = "Foto de resolución añadida";
        icon = "✅";
        break;
      case "resolution_doc":
        text = "Documento de resolución añadido";
        icon = "📑";
        break;
    }

    const row = document.createElement("div");
    row.style.padding = "6px 8px";
    row.style.borderBottom = "1px solid var(--border2)";
    row.innerHTML = `
      <div style="display:flex; justify-content:space-between; color:var(--muted); font-size:10px;">
        <span>${date}</span>
      </div>
      <div style="margin-top:2px;">${icon} ${text}</div>
    `;
    container.appendChild(row);
  });
}

async function loadComments(issueId) {
  const container = $("#dmCommentsList");
  if (!container) return;
  
  try {
    container.innerHTML = "<div style='text-align:center; padding:10px; opacity:0.6;'>Cargando comentarios...</div>";
    const comments = await fetchJson(`${API_BASE}/issues/${issueId}/comments`);
    renderComments(comments);
  } catch (e) {
    container.innerHTML = "<div style='color:var(--bad); padding:10px;'>Error al cargar comentarios.</div>";
  }
}

function renderComments(comments) {
  const container = $("#dmCommentsList");
  if (!container) return;
  container.innerHTML = "";

  if (!comments || comments.length === 0) {
    container.innerHTML = "<div style='text-align:center; padding:20px; opacity:0.5; font-size:13px;'>No hay comentarios todavía. ¡Sé el primero!</div>";
    return;
  }

  comments.forEach(c => {
    const date = new Date(c.created_at).toLocaleString();
    const div = document.createElement("div");
    div.style.padding = "10px";
    div.style.borderBottom = "1px solid var(--border2)";
    div.style.fontSize = "13px";
    div.innerHTML = `
      <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
        <strong style="color:var(--accent);">${safeText(c.username)}</strong>
        <span style="font-size:10px; color:var(--muted);">${date}</span>
      </div>
      <div style="white-space:pre-wrap; line-height:1.4;">${safeText(c.text)}</div>
    `;
    container.appendChild(div);
  });
  
  // Scroll al final
  container.scrollTop = container.scrollHeight;
}

async function addComment() {
  const input = $("#dmNewCommentInput");
  const text = input?.value.trim();
  if (!text || !currentDetailId) return;

  const btn = $("#dmBtnAddComment");
  setButtonBusy(btn, true, "...");

  try {
    await fetchJson(`${API_BASE}/issues/${currentDetailId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text })
    });
    input.value = "";
    await loadComments(currentDetailId);
  } catch (e) {
    toast(e.message, "error");
  } finally {
    setButtonBusy(btn, false);
  }
}

function translateStatus(s) {
  if (s === "open") return "Abierta";
  if (s === "in_progress") return "En curso";
  if (s === "resolved") return "Resuelta";
  return s || "-";
}

function toggleEditMode(enable) {
  const displayView = enable ? "none" : "block";
  const displayEdit = enable ? "block" : "none";
  const displayFlexView = enable ? "none" : "grid"; 
  const displayFlexEdit = enable ? "flex" : "none";

  const catContainer = $("#dmEditCatContainer");
  if(catContainer) catContainer.style.display = displayEdit;

  const mapContainer = $("#dmEditMapContainer");
  if(mapContainer) mapContainer.style.display = displayEdit;

  $("#dmDesc").style.display = displayView;
  $("#dmEditDesc").style.display = displayEdit;
  
  const commentsWrap = $("#dmCommentsWrapper");
  if(commentsWrap) commentsWrap.style.display = displayView;

  $("#dmStatusBadge").style.display = displayView;
  $("#dmEditStatus").style.display = displayEdit;
  $("#dmEditOriginals").style.display = displayEdit;
  $("#dmEditResContainer").style.display = displayEdit;
  $("#dmActionsView").style.display = displayFlexView;
  $("#dmActionsEdit").style.display = displayFlexEdit;
  
  const editBtn = $("#dmBtnEdit");
  if(editBtn) editBtn.style.visibility = enable ? "hidden" : "visible";
}

async function saveDetailChanges() {
  if (!currentDetailId) return;
  const btn = $("#dmBtnSaveEdit");
  setButtonBusy(btn, true, "Guardando...");

  try {
    const desc = $("#dmEditDesc").value.trim();
    const cat = $("#dmEditCategory").value.trim();
    const status = $("#dmEditStatus").value;
    const mapId = $("#dmEditMap")?.value;
    
    const photoInput = $("#dmResPhotoInput");
    const docInput = $("#dmResDocInput");
    const origPhoto = $("#dmEditPhotoInput");
    const origDoc = $("#dmEditDocInput");
    
    const fd = new FormData();
    fd.set("description", desc);
    fd.set("category", cat);
    fd.set("status", status);
    if(mapId) fd.set("map_id", mapId);
    
    if (photoInput?.files[0]) fd.set("resolution_photo", photoInput.files[0]);
    if (docInput?.files[0]) fd.set("resolution_doc", docInput.files[0]);
    if (origPhoto?.files[0]) fd.set("photo", origPhoto.files[0]);
    if (origDoc?.files[0]) fd.set("file", origDoc.files[0]);

    const updated = await fetchJson(`${API_BASE}/issues/${currentDetailId}`, { method: "PATCH", body: fd });
    toast("Guardado ✅", "ok");
    await loadIssues({ reset: true });
    
    if (updated) openDetailModal(updated);
    else toggleEditMode(false);
  } catch (e) {
    toast(`Error: ${e.message}`, "error");
  } finally {
    setButtonBusy(btn, false);
  }
}

export async function openDetailModal(it) {
  if (!it) return;
  currentDetailId = it.id;
  const modal = $("#detailModal");
  if (!modal) return;
  
  const currentUser = getUser();
  const isAdmin = currentUser?.role === 'admin';
  const isOwner = currentUser?.id === it.created_by;
  const canEdit = isAdmin || isOwner;
  
  toggleEditMode(false);

  $("#dmClose").onclick = () => modal.style.display = "none";
  modal.onclick = (e) => { if (e.target === modal) modal.style.display = "none"; };

  // Populate Map Select
  const mapSelect = $("#dmEditMap");
  if (mapSelect) {
      mapSelect.innerHTML = "";
      let maps = state.mapsList;
      if (!maps || maps.length === 0) {
          try {
             maps = await fetchJson(`${API_BASE}/maps`);
             state.mapsList = maps || []; 
          } catch(e) { console.error("Error loading maps", e); }
      }
      
      if(state.mapsList) {
          state.mapsList.forEach(m => {
              const opt = document.createElement("option");
              opt.value = m.id;
              opt.textContent = m.name; 
              if(it.map_id === m.id) opt.selected = true;
              mapSelect.appendChild(opt);
          });
      }
  }

  // Control de permisos para botones
  const btnEdit = $("#dmBtnEdit");
  const btnDel = $("#dmBtnDelete");
  
  if (btnEdit) btnEdit.style.display = canEdit ? "inline-block" : "none";
  if (btnDel) btnDel.style.display = canEdit ? "inline-block" : "none";

  if (canEdit) {
    $("#dmBtnEdit").onclick = () => toggleEditMode(true);
    $("#dmBtnCancelEdit").onclick = () => toggleEditMode(false);
    $("#dmBtnSaveEdit").onclick = saveDetailChanges;
    
    btnDel.onclick = async () => {
        if(!confirm("¿Borrar?")) return;
        setButtonBusy(btnDel, true, "Borrando...");
        try {
          await fetchJson(`${API_BASE}/issues/${it.id}`, { method: "DELETE" });
          toast("Borrada", "ok");
          modal.style.display = "none";
          loadIssues({ reset: true });
        } catch(e) { toast(e.message, "error"); }
        finally { setButtonBusy(btnDel, false); }
    };
  }

  $("#dmTitle").textContent = safeText(it.title);
  
  // Mostrar Fecha y Autor
  const dateStr = it.created_at ? new Date(it.created_at).toLocaleString() : "";
  const authorStr = it.created_by_username ? ` • Por: ${safeText(it.created_by_username)}` : "";
  $("#dmDate").textContent = dateStr + authorStr;

  $("#dmDesc").textContent = it.description || "";
  $("#dmEditDesc").value = it.description || "";
  $("#dmEditCategory").value = it.category || "";
  $("#dmEditStatus").value = it.status;

  // Inyectar sección de comentarios si no existe
  let commentsWrap = $("#dmCommentsWrapper");
  if (!commentsWrap) {
    commentsWrap = document.createElement("div");
    commentsWrap.id = "dmCommentsWrapper";
    commentsWrap.style.marginTop = "20px";
    commentsWrap.style.borderTop = "1px solid var(--border2)";
    commentsWrap.style.paddingTop = "16px";
    commentsWrap.innerHTML = `
      <h4 style="margin:0 0 12px 0; font-size:14px; display:flex; align-items:center; gap:8px;">💬 Comentarios</h4>
      <div id="dmCommentsList" style="max-height:250px; overflow-y:auto; background:rgba(0,0,0,0.1); border-radius:12px; margin-bottom:12px; border:1px solid var(--border2);"></div>
      <div style="display:flex; gap:8px;">
        <input id="dmNewCommentInput" placeholder="Escribe un comentario..." style="flex:1; padding:8px 12px; border-radius:10px; font-size:13px;" />
        <button id="dmBtnAddComment" class="btn small primary">Enviar</button>
      </div>
    `;
    $("#dmDesc").after(commentsWrap);
    
    $("#dmBtnAddComment").onclick = addComment;
    $("#dmNewCommentInput").onkeydown = (e) => { if(e.key === 'Enter') addComment(); };
  }
  
  // Cargar comentarios
  loadComments(it.id);

  ["dmResPhotoInput", "dmResDocInput", "dmEditPhotoInput", "dmEditDocInput"].forEach(id => {
    const el = document.getElementById(id);
    if(el) el.value = "";
  });
  
  ["dmResPhotoPreview", "dmResDocPreview", "dmEditPhotoPreview", "dmEditDocPreview"].forEach(id => {
    const el = document.getElementById(id);
    if(el) el.textContent = "";
  });

  const stBadge = $("#dmStatusBadge");
  stBadge.textContent = statusLabel(it.status);
  stBadge.style.color = it.status === 'resolved' ? 'var(--ok)' : (it.status === 'in_progress' ? 'var(--warn)' : 'var(--text)');
  stBadge.style.borderColor = it.status === 'resolved' ? 'var(--ok)' : 'var(--border2)';

  // Image
  const photoUrl = resolveSameOriginUrl(it.photo_url);
  const imgCont = $("#dmImgContainer");
  const img = $("#dmImg");
  if (photoUrl) {
    imgCont.style.display = "block";
    img.src = photoUrl;
    setImgFallback(img, { onFailReplace: false });
  } else {
    imgCont.style.display = "none";
  }

  // Doc
  const textUrl = resolveSameOriginUrl(it.text_url);
  const docCont = $("#dmDocContainer");
  const docLink = $("#dmDocLink");
  if (textUrl) {
    docCont.style.display = "block";
    docLink.onclick = (e) => { e.preventDefault(); showDocModal(textUrl, "Documento Adjunto"); };
  } else {
    docCont.style.display = "none";
  }

  // Resolution
  const resUrl = resolveSameOriginUrl(it.resolution_photo_url);
  const resDocUrl = resolveSameOriginUrl(it.resolution_text_url);
  const resCont = $("#dmResContainer");
  
  if (resUrl || resDocUrl) {
    resCont.style.display = "block";
    $("#dmResDesc").textContent = "Tarea resuelta.";
    const rImg = $("#dmResImg");
    if (resUrl) {
      rImg.style.display = "block";
      rImg.src = resUrl;
    } else {
      rImg.style.display = "none";
    }
    
    const rDocBox = $("#dmResDocBox");
    if (resDocUrl) {
      rDocBox.style.display = "block";
      $("#dmResDocLink").onclick = (e) => { e.preventDefault(); showDocModal(resDocUrl, "Resolución"); };
    } else {
      rDocBox.style.display = "none";
    }
  } else {
    resCont.style.display = "none";
  }

  // Actions
  $("#dmBtnMap").onclick = () => {
    modal.style.display = "none";
    setLatLng(it.lat, it.lng, { pan: true, setPin: true });
    $("#map")?.scrollIntoView({ behavior: "smooth" });
  };

  const btnHistory = $("#dmBtnHistory");
  const historyList = $("#dmHistoryList");
  if (historyList) historyList.style.display = "none"; // Reset al abrir

  if (btnHistory) {
    btnHistory.onclick = async () => {
      const isVisible = historyList.style.display === "block";
      if (isVisible) {
        historyList.style.display = "none";
      } else {
        historyList.style.display = "block";
        const items = $("#dmHistoryItems");
        if (items) items.innerHTML = "<div style='text-align:center; padding:10px;'>Cargando...</div>";
        try {
          const logs = await getIssueLogs(it.id);
          renderHistory(logs);
        } catch (e) {
          if (items) items.innerHTML = "<div style='color:var(--bad); padding:10px;'>Error al cargar historial.</div>";
        }
      }
    };
  }

  const btnFav = $("#dmBtnFav");
  const updateFavBtn = () => btnFav.textContent = isFav(it.id) ? "⭐ Quitar Favorito" : "☆ Marcar Favorito";
  updateFavBtn();
  btnFav.onclick = () => { toggleFav(it.id); updateFavBtn(); loadIssues({ reset: false }).catch(()=>{}); };

  // Wire previews for edit inputs (simplificado)
  const wirePreview = (inputId, previewId) => {
    const inp = $(`#${inputId}`);
    if(inp) inp.onchange = () => $(`#${previewId}`).textContent = inp.files[0] ? inp.files[0].name : "";
  };
  wirePreview("dmResPhotoInput", "dmResPhotoPreview");
  wirePreview("dmResDocInput", "dmResDocPreview");
  wirePreview("dmEditPhotoInput", "dmEditPhotoPreview");
  wirePreview("dmEditDocInput", "dmEditDocPreview");

  modal.style.display = "flex";
}
