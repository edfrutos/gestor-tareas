// src/config/uploadTypes.js
"use strict";

const path = require("path");

/**
 * Tipos de subida permitidos: MIME aceptado -> extensiones válidas para él
 * (la primera es la canónica).
 *
 * La extensión con la que se guarda un fichero la decide el servidor, nunca el
 * `originalname` del cliente: /uploads se sirve como estático y el navegador
 * interpreta el fichero según su extensión.
 */
const IMAGE_TYPES = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
  "image/gif": [".gif"],
};

const MAP_IMAGE_TYPES = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
};

const DOC_TYPES = {
  "application/pdf": [".pdf"],
  "text/plain": [".txt", ".md", ".markdown"],
  "text/markdown": [".md", ".markdown", ".txt"],
};

// MIME que mandan los navegadores/clientes cuando no reconocen el tipo (p. ej.
// .md en algunos navegadores, o el cliente macOS para extensiones que no
// conoce). Solo en ese caso decide la extensión original, y siempre que esté
// en la lista del tipo.
const GENERIC_MIMES = new Set(["", "application/octet-stream"]);

/**
 * Extensión segura con la que guardar `file`, o `null` si no se permite.
 * @param {{ originalname?: string, mimetype?: string }} file
 * @param {Record<string, string[]>} types - IMAGE_TYPES, MAP_IMAGE_TYPES o DOC_TYPES
 * @returns {string|null}
 */
function pickUploadExtension(file, types) {
  const ext = path.extname(file.originalname || "").toLowerCase();
  const mime = String(file.mimetype || "").toLowerCase().trim();

  const exts = types[mime];
  if (exts) return exts.includes(ext) ? ext : exts[0];

  if (GENERIC_MIMES.has(mime)) {
    const all = new Set(Object.values(types).flat());
    return all.has(ext) ? ext : null;
  }

  return null;
}

// Extensiones que /uploads sirve con su tipo real. Cualquier otra (ficheros
// antiguos subidos antes de este control, o `.bin`) se sirve como descarga.
const SERVABLE_UPLOAD_EXTS = new Set([
  ".jpg", ".jpeg", ".png", ".webp", ".gif",
  ".pdf", ".txt", ".md", ".markdown",
]);

module.exports = {
  IMAGE_TYPES,
  MAP_IMAGE_TYPES,
  DOC_TYPES,
  pickUploadExtension,
  SERVABLE_UPLOAD_EXTS,
};
