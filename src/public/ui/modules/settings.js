import { API_BASE } from "./config.js";
import { fetchJson } from "./api.js";
import { $, toast } from "./utils.js";

export function initSettingsModule() {
  const btn = $("#btnSettings");
  if (btn) btn.onclick = openSettingsModal;

  const modal = $("#settingsModal");
  const close = $("#settingsClose");
  if (close && modal) {
    close.onclick = () => (modal.style.display = "none");
    modal.onclick = (e) => {
      if (e.target === modal) modal.style.display = "none";
    };
  }

  const form = $("#settingsForm");
  if (form) {
    form.onsubmit = handleSettingsSubmit;
  }
}

async function openSettingsModal() {
  const modal = $("#settingsModal");
  const form = $("#settingsForm");
  const status = $("#settingsStatus");

  if (!modal || !form) return;

  status.textContent = "Cargando...";
  status.style.color = "var(--text)";
  modal.style.display = "flex";

  try {
    const settings = await fetchJson(`${API_BASE}/settings`);
    
    // Rellenar formulario
    for (const key in settings) {
      const input = form.elements[key];
      if (input) {
        if (input.type === "checkbox") {
          input.checked = !!settings[key];
        } else {
          input.value = settings[key] ?? "";
        }
      }
    }
    status.textContent = "";
  } catch (err) {
    console.error("[Settings] Error loading:", err);
    status.textContent = "Error al cargar configuración";
    status.style.color = "var(--bad)";
  }
}

async function handleSettingsSubmit(e) {
  e.preventDefault();
  const form = e.target;
  const status = $("#settingsStatus");
  const btn = form.querySelector("button[type='submit']");

  try {
    status.textContent = "Guardando...";
    status.style.color = "var(--text)";
    btn.disabled = true;

    const formData = new FormData(form);
    const payload = {};
    
    // Procesar todos los campos del formulario
    for (const [key, value] of formData.entries()) {
      payload[key] = value;
    }

    // Los checkboxes no aparecen en FormData si no están marcados
    const checkboxes = form.querySelectorAll("input[type='checkbox']");
    checkboxes.forEach(cb => {
      payload[cb.name] = cb.checked;
    });

    await fetchJson(`${API_BASE}/settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    status.textContent = "Configuración guardada ✅";
    status.style.color = "var(--ok)";
    toast("Configuración actualizada correctamente", "success");
    
    setTimeout(() => {
      $("#settingsModal").style.display = "none";
    }, 1500);

  } catch (err) {
    console.error("[Settings] Error saving:", err);
    status.textContent = err.message || "Error al guardar";
    status.style.color = "var(--bad)";
  } finally {
    btn.disabled = false;
  }
}
