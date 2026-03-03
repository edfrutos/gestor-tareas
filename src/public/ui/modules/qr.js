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

    const card = document.createElement("div");
    card.className = "modalCard";
    card.style.cssText = "max-width: 350px; text-align: center; padding: 20px;";

    const top = document.createElement("div");
    top.className = "modalTop";

    const titleWrap = document.createElement("div");
    titleWrap.className = "title";
    const titleStrong = document.createElement("strong");
    titleStrong.textContent = title;
    titleWrap.appendChild(titleStrong);

    const closeBtn = document.createElement("button");
    closeBtn.className = "btn small";
    closeBtn.id = "qrClose";
    closeBtn.textContent = "✕";

    top.appendChild(titleWrap);
    top.appendChild(closeBtn);

    const container = document.createElement("div");
    container.id = "qrContainer";
    container.style.cssText = "padding: 20px; background: white; display: inline-block; margin: 20px 0; border-radius: 10px;";

    const urlDiv = document.createElement("div");
    urlDiv.id = "qrUrl";
    urlDiv.style.cssText = "font-size: 12px; color: var(--muted); margin-bottom: 15px; word-break: break-all; padding: 0 10px;";
    urlDiv.textContent = url;

    const btnWrap = document.createElement("div");
    btnWrap.style.cssText = "display: flex; gap: 10px; justify-content: center; padding-bottom: 10px;";

    const downloadBtn = document.createElement("button");
    downloadBtn.className = "btn primary small";
    downloadBtn.id = "qrDownload";
    downloadBtn.textContent = "📥 Descargar PNG";

    const copyBtn = document.createElement("button");
    copyBtn.className = "btn small";
    copyBtn.id = "qrCopy";
    copyBtn.textContent = "📋 Copiar Link";

    btnWrap.appendChild(downloadBtn);
    btnWrap.appendChild(copyBtn);

    card.appendChild(top);
    card.appendChild(container);
    card.appendChild(urlDiv);
    card.appendChild(btnWrap);
    modal.appendChild(card);
    document.body.appendChild(modal);

    closeBtn.onclick = () => (modal.style.display = "none");

    copyBtn.onclick = () => {
      const urlToCopy = urlDiv.textContent || "";
      navigator.clipboard.writeText(urlToCopy);
      const originalText = copyBtn.textContent;
      copyBtn.textContent = "✅ Copiado";
      setTimeout(() => (copyBtn.textContent = originalText), 2000);
    };

    downloadBtn.onclick = () => {
      const img = container.querySelector("img");
      if (!img || !img.src) return;
      const link = document.createElement("a");
      link.download = `qr-${Date.now()}.png`;
      link.href = img.src;
      link.click();
    };
  } else {
    const titleEl = modal.querySelector(".title strong");
    const urlEl = modal.querySelector("#qrUrl") || modal.querySelector("div[style*='word-break']");
    if (titleEl) titleEl.textContent = title;
    if (urlEl) urlEl.textContent = url;
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
