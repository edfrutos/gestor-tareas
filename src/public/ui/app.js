import { wireForms, loadCategories } from "./modules/forms.js";
import { loadIssues } from "./modules/list.js";
import { getConfig } from "./modules/api.js";
import { ensureMap } from "./modules/map.js";
import { setStatus, $ } from "./modules/utils.js";
import { LS_THEME } from "./modules/config.js";

console.log("[App] Módulos cargados correctamente.");

// Global Error Handler
window.onerror = function(msg, url, line) {
  if (msg === "ResizeObserver loop completed with undelivered notifications.") return;
  const err = `JS Error: ${msg}`;
  console.error(err);
  const el = $("#status");
  if(el) { el.textContent = err; el.dataset.kind = "error"; }
};

// Global click delegation
document.addEventListener("click", (ev) => {
  const t = ev.target;
  const refreshBtn = t.closest?.("#btnRefresh");
  if (refreshBtn) {
    ev.preventDefault();
    setStatus("Refrescando...", "info");
    loadIssues({ reset: true }).catch(e => setStatus(e.message, "error"));
  }
}, true);

// Theme logic
function initTheme() {
  const sel = $("#themeSelect");
  if (!sel) return;
  
  const saved = localStorage.getItem(LS_THEME) || "auto";
  sel.value = saved;
  
  const apply = (v) => {
    let mode = v;
    if (v === "auto") mode = window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", mode);
  };
  
  apply(saved);
  sel.onchange = () => {
    localStorage.setItem(LS_THEME, sel.value);
    apply(sel.value);
  };
  
  window.matchMedia("(prefers-color-scheme: light)").addEventListener("change", () => {
    if (localStorage.getItem(LS_THEME) === "auto") apply("auto");
  });
}

// Boot
(async () => {
  try {
    // Esperar DOM si no está listo (aunque defer ayuda)
    if (document.readyState === "loading") {
        await new Promise(r => document.addEventListener("DOMContentLoaded", r));
    }

    wireForms();
    initTheme();
    ensureMap(); 
    
    await getConfig();
    await loadCategories();
    await loadIssues({ reset: true });
    
  } catch (e) {
    console.error(e);
    setStatus(`Error inicio: ${e.message}`, "error");
  }
})();