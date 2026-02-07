import { state, isFav, toggleFav } from "./store.js";
import { API_BASE } from "./config.js";
import { fetchJson } from "./api.js";
import { $, safeText, statusLabel, resolveSameOriginUrl, setImgFallback, withBusy, setButtonBusy, toast } from "./utils.js";
import { setLatLng } from "./map.js";
import { showDocModal } from "./modals.js";
import { loadIssues } from "./list.js";

let currentDetailId = null;

function toggleEditMode(enable) {
  const displayView = enable ? "none" : "block";
  const displayEdit = enable ? "block" : "none";
  const displayFlexView = enable ? "none" : "grid"; 
  const displayFlexEdit = enable ? "flex" : "none";

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
    const status = $("#dmEditStatus").value;
    
    const photoInput = $("#dmResPhotoInput");
    const docInput = $("#dmResDocInput");
    const origPhoto = $("#dmEditPhotoInput");
    const origDoc = $("#dmEditDocInput");
    
    const fd = new FormData();
    fd.set("description", desc);
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
