import { API_BASE } from "./config.js";
import { fetchJson } from "./api.js";
import { getUser } from "./auth.js";
import { $ } from "./utils.js";

/** Abre el formulario de contacto, precargando nombre/email si hay sesión. */
export function showContactModal() {
  const modal = $("#contactModal");
  if (!modal) return;
  const user = getUser();
  const nameInp = $("#contactName");
  const emailInp = $("#contactEmail");
  if (user) {
    if (nameInp && !nameInp.value) nameInp.value = user.username || "";
    if (emailInp && !emailInp.value) emailInp.value = user.email || "";
  }
  $("#contactStatus").textContent = "";
  modal.style.display = "flex";
  (nameInp?.value ? $("#contactSubject") : nameInp)?.focus();
}

function hideContactModal() {
  const modal = $("#contactModal");
  if (modal) modal.style.display = "none";
}

function errorMessage(err) {
  if (err.status === 429) return "Has enviado demasiados mensajes. Inténtalo más tarde.";
  const e = err.data?.error;
  if (Array.isArray(e)) return e.map((x) => x.message).join(", ");
  if (typeof e === "string") return e;
  return err.message || "No se pudo enviar el mensaje";
}

/**
 * Se inicializa antes del login (el formulario también se usa sin sesión):
 * enlace en el login (`#lnkContact`) y botón en "Mi Perfil" (`#profileBtnContact`).
 */
export function initContactModule() {
  const form = $("#contactForm");
  const status = $("#contactStatus");
  const submitBtn = $("#contactSubmit");

  const lnk = $("#lnkContact");
  if (lnk) lnk.onclick = (e) => { e.preventDefault(); showContactModal(); };

  const profileBtn = $("#profileBtnContact");
  if (profileBtn) profileBtn.onclick = () => showContactModal();

  const cancel = $("#contactCancel");
  if (cancel) cancel.onclick = hideContactModal;

  if (!form) return;
  form.onsubmit = async (e) => {
    e.preventDefault();
    const payload = {
      name: $("#contactName").value,
      email: $("#contactEmail").value,
      subject: $("#contactSubject").value,
      message: $("#contactMessage").value,
      website: $("#contactWebsite").value,
      source: "web",
    };
    try {
      submitBtn.disabled = true;
      status.textContent = "Enviando...";
      status.style.color = "var(--text)";
      await fetchJson(`${API_BASE}/contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      status.textContent = "Mensaje enviado ✅ Te responderemos por email.";
      status.style.color = "var(--ok)";
      $("#contactSubject").value = "";
      $("#contactMessage").value = "";
      setTimeout(hideContactModal, 2500);
    } catch (err) {
      status.textContent = errorMessage(err);
      status.style.color = "var(--bad)";
    } finally {
      submitBtn.disabled = false;
    }
  };
}
