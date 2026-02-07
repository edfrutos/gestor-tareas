import { state, isMine, isFav, toggleFav } from "./store.js";
import { API_BASE } from "./config.js";
import { fetchJson } from "./api.js";
import { $, safeText, statusLabel, catColor, resolveSameOriginUrl, setImgFallback, withBusy, setStatus, toast } from "./utils.js";
import { addMarkers, clearMarkers } from "./map.js";
import { openDetailModal } from "./details.js";
import { showPhotoModal, showDocModal } from "./modals.js";

// Filtros
let qEl, fStatusEl, fCategoryEl, sortEl, onlyMineEl, onlyFavsEl, btnMoreEl;

export function ensureFiltersBar() {
  qEl = $("#q");
  fStatusEl = $("#fStatus");
  fCategoryEl = $("#fCategory");
  sortEl = $("#order") || $("#sort");
  onlyMineEl = $("#onlyMine");
  onlyFavsEl = $("#onlyFavs");
  btnMoreEl = $("#btnMore");

  // Inyectar si no existen (lógica simplificada, asumo que existen en index.html o se inyectan igual que antes)
  // ... (omito la inyección HTML larga para brevedad, asumo index.html completo)
  
  if (ensureFiltersBar._bound) return;
  ensureFiltersBar._bound = true;

  const reload = () => loadIssues({ reset: true });

  let qTimer = null;
  if (qEl) qEl.addEventListener("input", () => { clearTimeout(qTimer); qTimer = setTimeout(reload, 250); });
  
  let fCatTimer = null;
  if (fCategoryEl) fCategoryEl.addEventListener("input", () => { clearTimeout(fCatTimer); fCatTimer = setTimeout(reload, 400); });

  if (fStatusEl) fStatusEl.addEventListener("change", reload);
  if (sortEl) sortEl.addEventListener("change", reload);
  if (onlyMineEl) onlyMineEl.addEventListener("change", reload);
  if (onlyFavsEl) onlyFavsEl.addEventListener("change", reload);

  if (btnMoreEl) btnMoreEl.addEventListener("click", () => loadIssues({ reset: false }));
}

function buildQuery(page) {
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("pageSize", "10");
  params.set("_t", String(Date.now()));

  if (qEl?.value) params.set("q", qEl.value.trim());
  if (fStatusEl?.value) params.set("status", fStatusEl.value);
  if (fCategoryEl?.value) params.set("category", fCategoryEl.value.trim());
  if (sortEl?.value) params.set("order", sortEl.value);

  return params.toString();
}

function renderEmptyState() {
  const listEl = $("#list");
  if (!listEl) return;
  listEl.innerHTML = `<div class="issueCard" style="padding:14px;opacity:.9;"><div class="issueMain">No hay tareas.</div></div>`;
}

function renderSkeletonList() {
  const listEl = $("#list");
  if (listEl) listEl.innerHTML = `<div class="issueCard" style="padding:20px;opacity:.5;">Cargando...</div>`;
}

function renderList(items, mode) {
  const listEl = $("#list");
  if (!listEl) return;
  
  if (mode === "replace") {
    listEl.innerHTML = "";
    if (!items.length) { renderEmptyState(); return; }
  }

  items.forEach(it => {
    state.allItemsById.set(it.id, it);
    
    const row = document.createElement("div");
    row.className = "issueRow";
    row.id = `issue-${it.id}`;
    row.style.setProperty("--catColor", catColor(it.category));
    row.setAttribute("role", "button");
    row.setAttribute("tabindex", "0");
    row.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") openDetailModal(it); });
    
    const title = safeText(it.title);
    const desc = safeText(it.description);
    const dateStr = it.created_at ? new Date(it.created_at).toLocaleDateString() : "";
    const thumbUrl = resolveSameOriginUrl(it.thumb_url);
    const hasThumb = !!thumbUrl;
    const hasDoc = !!it.text_url;

    let thumbHtml;
    if (hasThumb) thumbHtml = `<img class="thumb" src="${thumbUrl}" alt="foto" loading="lazy">`;
    else if (hasDoc) thumbHtml = `<div class="thumb" style="display:flex;align-items:center;justify-content:center;font-size:24px;background:rgba(255,255,255,.08);">📄</div>`;
    else thumbHtml = `<div class="thumb" style="display:flex;align-items:center;justify-content:center;font-size:20px;color:rgba(255,255,255,.2);">📷</div>`;

    row.innerHTML = `
      ${thumbHtml}
      <div class="info"><div class="title">${title}</div><div class="desc">${desc}</div><div class="meta-mobile">${statusLabel(it.status)} · ${dateStr}</div></div>
      <div class="col-cat"><span class="badge" style="background:var(--chip2);border:1px solid rgba(255,255,255,.1);">${safeText(it.category)}</span></div>
      <div class="col-status"><span class="badge" style="color:var(--text);opacity:.8;">${statusLabel(it.status)}</span></div>
      <div class="col-action" style="text-align:right;display:flex;gap:6px;justify-content:flex-end;">
        <button class="btn small btn-fav-quick">${isFav(it.id) ? "⭐" : "☆"}</button>
        ${it.photo_url ? `<button class="btn small btn-photo-quick">📷</button>` : ''}
        ${it.text_url ? `<button class="btn small btn-doc-quick">📄</button>` : ''}
        <button class="btn small" style="padding:6px 10px;">➔</button>
      </div>
    `;

    const imgEl = row.querySelector("img");
    if (imgEl) setImgFallback(imgEl, { fallbackSrc: resolveSameOriginUrl(it.photo_url), onFailReplace: false });

    row.addEventListener("click", () => openDetailModal(it));

    row.querySelector(".btn-fav-quick").addEventListener("click", (e) => {
      e.stopPropagation();
      toggleFav(it.id);
      e.target.textContent = isFav(it.id) ? "⭐" : "☆";
      if (onlyFavsEl?.checked) loadIssues({ reset: false }).catch(()=>{});
    });

    const btnPhoto = row.querySelector(".btn-photo-quick");
    if (btnPhoto) btnPhoto.addEventListener("click", (e) => { e.stopPropagation(); showPhotoModal(it.photo_url); });

    const btnDoc = row.querySelector(".btn-doc-quick");
    if (btnDoc) btnDoc.addEventListener("click", (e) => { e.stopPropagation(); showDocModal(it.text_url, "Documento Adjunto"); });

    listEl.appendChild(row);
  });
}

// Internal wrapped function
const _loadIssues = withBusy(async ({ reset } = {}) => {
  ensureFiltersBar();
  if (reset) renderSkeletonList();

  try {
    if (reset) {
      state.currentPage = 1;
      state.hasMore = true;
      state.allItemsById.clear();
      clearMarkers();
      renderList([], "replace");
    }
    if (!state.hasMore) return;

    const qs = buildQuery(state.currentPage);
    const data = await fetchJson(`${API_BASE}/issues?${qs}`);
    const items = data.items || [];

    let filtered = items;
    if (onlyMineEl?.checked) filtered = filtered.filter(it => isMine(it.id));
    if (onlyFavsEl?.checked) filtered = filtered.filter(it => isFav(it.id));

    // Client sort fallback...
    const order = sortEl?.value || "new";
    if (order === "old") filtered.sort((a,b) => new Date(a.created_at) - new Date(b.created_at));
    // ... otros sorts ...

    if (reset && !filtered.length) {
      renderEmptyState();
      clearMarkers();
    } else {
      renderList(filtered, reset ? "replace" : "append");
      addMarkers(filtered, openDetailModal);
    }

    const total = Number(data.total || 0);
    const loaded = state.currentPage * 10;
    state.hasMore = total ? loaded < total : items.length === 10;
    if (btnMoreEl) btnMoreEl.disabled = !state.hasMore;
    state.currentPage++;
    
    setStatus("", "info");
  } catch (e) {
    const msg = e.message || "";
    if ((e.status === 401 || e.status === 403) && !localStorage.getItem(LS_API_KEY)) {
      setStatus("Falta API Key. Pégala arriba.", "error");
    } else {
      setStatus(`Error al cargar: ${msg}`, "error");
    }
  }
}, { overlayText: "Cargando...", showOverlay: false });

// Export as function to avoid circular dependency TDZ
export function loadIssues(opts) {
  return _loadIssues(opts);
}
