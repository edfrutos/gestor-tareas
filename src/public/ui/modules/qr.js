import { $ } from "./utils.js";

/**
 * Muestra un código QR para una URL específica en un modal.
 * @param {string} url - La URL a codificar.
 * @param {string} title - Título del modal.
 */
export function showQrModal(url, title = "Código QR") {
  // Crear el modal si no existe
  let modal = $("#qrModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "qrModal";
    modal.className = "modal";
    modal.innerHTML = `
      <div class="modalCard" style="max-width: 350px; text-align: center; padding: 20px;">
        <div class="modalTop">
          <div class="title"><strong>${title}</strong></div>
          <button class="btn small" id="qrClose">✕</button>
        </div>
        <div id="qrContainer" style="padding: 20px; background: white; display: inline-block; margin: 20px 0; border-radius: 10px;"></div>
        <div style="font-size: 12px; color: var(--muted); margin-bottom: 15px; word-break: break-all; padding: 0 10px;">
          ${url}
        </div>
        <div style="display: flex; gap: 10px; justify-content: center; padding-bottom: 10px;">
          <button class="btn primary small" id="qrDownload">📥 Descargar PNG</button>
          <button class="btn small" id="qrCopy">📋 Copiar Link</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    $("#qrClose").onclick = () => modal.style.display = "none";
    
    $("#qrCopy").onclick = () => {
      navigator.clipboard.writeText(url);
      const originalText = $("#qrCopy").textContent;
      $("#qrCopy").textContent = "✅ Copiado";
      setTimeout(() => $("#qrCopy").textContent = originalText, 2000);
    };

    $("#qrDownload").onclick = () => {
      const img = $("#qrContainer img");
      if (!img) return;
      const link = document.createElement("a");
      link.download = `qr-${Date.now()}.png`;
      link.href = img.src;
      link.click();
    };
  } else {
    modal.querySelector(".title strong").textContent = title;
    modal.querySelector("div[style*='word-break']").textContent = url;
  }

  const container = $("#qrContainer");
  container.innerHTML = ""; // Limpiar anterior

  // Generar QR
  new QRCode(container, {
    text: url,
    width: 200,
    height: 200,
    colorDark: "#000000",
    colorLight: "#ffffff",
    correctLevel: QRCode.CorrectLevel.H
  });

  modal.style.display = "flex";
}

/**
 * Genera una URL de deep link para una tarea.
 */
export function getIssueUrl(issueId) {
  const url = new URL(window.location.href);
  url.searchParams.set("issue", issueId);
  // Eliminar otros parámetros si existen para que el QR sea limpio
  const cleanUrl = `${url.origin}${url.pathname}?issue=${issueId}`;
  return cleanUrl;
}

/**
 * Genera una URL de deep link para un plano.
 */
export function getMapUrl(mapId) {
  const url = new URL(window.location.href);
  url.searchParams.set("map", mapId);
  const cleanUrl = `${url.origin}${url.pathname}?map=${mapId}`;
  return cleanUrl;
}
