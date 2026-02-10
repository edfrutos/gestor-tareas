import { API_BASE, LS_API_KEY } from "./config.js";
import { fetchJson, getApiKey } from "./api.js";
import { $, withBusy, setStatus, setButtonBusy, setGlobalLoading, toast, safeText } from "./utils.js";
import { loadIssues } from "./list.v2.js";
import { setLatLng, ensureMap } from "./map.js";
import { state, markMine } from "./store.js";

// Previews creación
function updatePhotoPreview(file) {
  const box = $("#photoPreview");
  const img = $("#photoPreviewImg");
  const meta = $("#photoPreviewMeta");
  const btn = $("#btnClearPhotoInput");
  
  if (!box || !img) return;
  if (!file) { box.style.display = "none"; img.src = ""; return; }

  box.style.display = "flex";
  meta.textContent = `${file.name}`;
  const url = URL.createObjectURL(file);
  img.src = url;
  img.onload = () => URL.revokeObjectURL(url);
  btn.onclick = () => { $("#photo").value = ""; updatePhotoPreview(null); };
}

function updateDocPreview(file) {
  const box = $("#filePreview");
  const meta = $("#filePreviewMeta");
  const btn = $("#btnClearFileInput");
  
  if (!box) return;
  if (!file) { box.style.display = "none"; return; }

  box.style.display = "flex";
  meta.innerHTML = `<strong>${file.name}</strong>`;
  btn.onclick = () => { $("#file").value = ""; updateDocPreview(null); };
}

export async function loadCategories() {
  try {
    const cats = await fetchJson(`${API_BASE}/issues/categories`);
    if (!Array.isArray(cats)) return;
    
    // Fill Datalist (Creation)
    const dl = document.getElementById("categoryOptions");
    if(dl) dl.innerHTML = cats.map(c => `<option value="${safeText(c)}"></option>`).join("");

    // Fill Select (Filter)
    const sel = document.getElementById("fCategory");
    if(sel) {
      const current = sel.value;
      const opts = ['<option value="">Categoría: todas</option>'];
      cats.forEach(c => {
        const s = safeText(c);
        opts.push(`<option value="${s}">${s.charAt(0).toUpperCase() + s.slice(1)}</option>`);
      });
      sel.innerHTML = opts.join("");
      sel.value = current; // Mantener selección si existía
    }
  } catch (e) { console.warn(e); }
}

const createIssueMultipart = withBusy(async () => {
  const btn = $('form button[type="submit"]');
  setButtonBusy(btn, true, "Creando...");
  
  try {
    const title = $("#title")?.value.trim();
    const cat = $("#category")?.value.trim();
    const desc = $("#description")?.value.trim();
    const lat = $("#lat")?.value;
    const lng = $("#lng")?.value;

    if (!lat || !lng) {
      $("#map")?.scrollIntoView({ behavior: "smooth" });
      throw new Error("⚠️ Indica ubicación en el mapa.");
    }
    if (!title || !cat || !desc) throw new Error("Completa los campos obligatorios.");

    const fd = new FormData();
    fd.set("title", title);
    fd.set("category", cat);
    fd.set("description", desc);
    fd.set("lat", lat);
    fd.set("lng", lng);
    
    const fPhoto = $("#photo")?.files[0];
    const fDoc = $("#file")?.files[0];
    if (fPhoto) fd.set("photo", fPhoto);
    if (fDoc) fd.set("file", fDoc);

    setGlobalLoading(true, "Creando...");
    const data = await fetchJson(`${API_BASE}/issues`, { method: "POST", body: fd });
    
    // Clear
    $("#title").value = "";
    $("#description").value = "";
    $("#photo").value = "";
    $("#file").value = "";
    updatePhotoPreview(null);
    updateDocPreview(null);

    toast("Creada ✅", "ok");
    await loadIssues({ reset: true });
    await loadCategories(); // Actualizar desplegables con posibles nuevas categorías
    
    if (data?.id) {
      markMine(data.id);
      setTimeout(() => $(`#issue-${data.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 150);
    }
  } catch(e) {
    setStatus(e.message, "error");
  } finally {
    setButtonBusy(btn, false);
    setGlobalLoading(false);
  }
}, { overlayText: "Guardando...", showOverlay: true });

export function wireForms() {
  // Listeners inputs creación
  const elPhoto = $("#photo");
  if(elPhoto) elPhoto.onchange = () => updatePhotoPreview(elPhoto.files[0]);
  
  const elFile = $("#file");
  if(elFile) elFile.onchange = () => updateDocPreview(elFile.files[0]);

  // Submit
  const form = $("form");
  if (form) {
    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      await createIssueMultipart();
    });
  }

  // Clear
  $("#btnClear")?.addEventListener("click", (e) => {
    e.preventDefault();
    $("#title").value = "";
    $("#description").value = "";
    $("#lat").value = "";
    $("#lng").value = "";
    $("#photo").value = "";
    $("#file").value = "";
    updatePhotoPreview(null);
    updateDocPreview(null);
    if (state.markerPin && state.map) {
      state.map.removeLayer(state.markerPin);
      state.markerPin = null;
      state.map.setView([500, 500], 0);
    }
    setStatus("", "info");
  });

  // API Key
  const kInp = $("#apiKey");
  if(kInp) kInp.value = getApiKey();
  $("#btnSaveKey")?.addEventListener("click", async () => {
    const v = kInp.value.trim();
    if(!v) localStorage.removeItem(LS_API_KEY);
    else localStorage.setItem(LS_API_KEY, v);
    toast("API Key guardada", "ok");
    await loadIssues({reset:true});
  });
}
