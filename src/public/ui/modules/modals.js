import { resolveSameOriginUrl } from "./utils.js";

// --- Foto ---
export function showPhotoModal(url) {
  const modal = document.getElementById("photoModal");
  const img = document.getElementById("photoImg");
  const close = document.getElementById("photoClose");
  if (!modal || !img) return;

  img.src = resolveSameOriginUrl(url);
  modal.style.display = "flex";
  
  const hide = () => { modal.style.display = "none"; };
  close.onclick = hide;
  modal.onclick = (e) => { if (e.target === modal) hide(); };
}

// --- Documento ---
export async function showDocModal(url, title = "Documento") {
  const modal = document.getElementById("docModal");
  const frame = document.getElementById("docFrame");
  const textContent = document.getElementById("docTextContent");
  const titleEl = document.getElementById("docModalTitle");
  const closeBtn = document.getElementById("docClose");

  if (!modal) return;

  if(titleEl) titleEl.textContent = title;
  modal.style.display = "flex";

  const resolvedUrl = resolveSameOriginUrl(url);
  const isPdf = resolvedUrl.toLowerCase().includes(".pdf");

  if (isPdf && frame) {
      frame.style.display = "block";
      if (textContent) textContent.style.display = "none";
      const sep = resolvedUrl.includes("?") ? "&" : "?";
      frame.src = `${resolvedUrl}${sep}t=${Date.now()}`;
  } else if (textContent) {
      if (frame) frame.style.display = "none";
      textContent.style.display = "block";
      textContent.textContent = "Cargando contenido...";
      
      try {
          const sep = resolvedUrl.includes("?") ? "&" : "?";
          const res = await fetch(`${resolvedUrl}${sep}t=${Date.now()}`);
          if (!res.ok) throw new Error(`Error HTTP ${res.status}`);
          const text = await res.text();
          
          const isMd = resolvedUrl.toLowerCase().endsWith(".md") || resolvedUrl.toLowerCase().endsWith(".markdown");
          if (isMd && typeof marked !== "undefined") {
              textContent.innerHTML = marked.parse(text);
              textContent.style.whiteSpace = "normal";
              textContent.style.fontFamily = "system-ui, sans-serif";
              textContent.style.lineHeight = "1.6";
          } else {
              textContent.textContent = text;
              textContent.style.whiteSpace = "pre-wrap";
              textContent.style.fontFamily = "monospace";
          }
      } catch (e) {
          textContent.textContent = `No se pudo cargar el documento.
${e.message}`;
      }
  }

  const close = () => {
    modal.style.display = "none";
    if (frame) frame.src = "about:blank";
    if (textContent) textContent.textContent = "";
  };

  if (closeBtn) closeBtn.onclick = close;
  modal.onclick = (e) => { if (e.target === modal) close(); };
}
