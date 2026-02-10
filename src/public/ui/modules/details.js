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

function translateStatus(s) {
  if (s === "open") return "Abierta";
  if (s === "in_progress") return "En curso";
  if (s === "resolved") return "Resuelta";
  return s || "-";
}

function toggleEditMode(enable) {
  console.log("toggleEditMode", enable);
  const displayView = enable ? "none" : "block";
  const displayEdit = enable ? "block" : "none";
  const displayFlexView = enable ? "none" : "grid"; 
  const displayFlexEdit = enable ? "flex" : "none";

  const catContainer = $("#dmEditCatContainer");
  if(catContainer) catContainer.style.display = displayEdit;
  else console.warn("dmEditCatContainer not found");

  $("#dmDesc").style.display = displayView;
  $("#dmEditDesc").style.display = displayEdit;
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
    
    const photoInput = $("#dmResPhotoInput");
    const docInput = $("#dmResDocInput");
    const origPhoto = $("#dmEditPhotoInput");
    const origDoc = $("#dmEditDocInput");
    
    const fd = new FormData();
    fd.set("description", desc);
    fd.set("category", cat);
    fd.set("status", status);
    
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

export function openDetailModal(it) {
  if (!it) return;
  currentDetailId = it.id;
  const modal = $("#detailModal");
  if (!modal) return;
  
  toggleEditMode(false);

  $("#dmClose").onclick = () => modal.style.display = "none";
  modal.onclick = (e) => { if (e.target === modal) modal.style.display = "none"; };

  $("#dmBtnEdit").onclick = () => toggleEditMode(true);
  $("#dmBtnCancelEdit").onclick = () => toggleEditMode(false);
  $("#dmBtnSaveEdit").onclick = saveDetailChanges;

  $("#dmTitle").textContent = safeText(it.title);
  $("#dmDate").textContent = it.created_at ? new Date(it.created_at).toLocaleString() : "";
  $("#dmDesc").textContent = it.description || "";
  $("#dmEditDesc").value = it.description || "";
  $("#dmEditCategory").value = it.category || "";
  $("#dmEditStatus").value = it.status;

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

  const btnDel = $("#dmBtnDelete");
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
