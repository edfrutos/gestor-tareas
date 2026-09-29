// src/config/trustProxy.js
"use strict";

/**
 * Valor para `app.set("trust proxy", ...)` a partir de TRUST_PROXY.
 *
 * Detrás de un proxy (Plesk/nginx, Caddy) todas las conexiones llegan desde
 * la IP del proxy; con "trust proxy" Express toma la IP real de
 * X-Forwarded-For. Solo debe activarse si el puerto de la app NO es
 * accesible directamente desde internet, o cualquiera podría falsear esa
 * cabecera.
 *
 * - sin definir -> 1 (un salto: el proxy de delante)
 * - "0" / "false" -> desactivado
 * - número -> número de saltos de confianza
 * - otro texto -> lista de IPs/subredes de confianza (p. ej. "loopback, 172.17.0.0/16")
 */
function parseTrustProxy(value) {
  if (value === undefined || value === null) return 1;
  const s = String(value).trim();
  if (s === "") return 1;
  const lower = s.toLowerCase();
  if (lower === "0" || lower === "false") return false;
  if (lower === "true") return true;
  if (/^\d+$/.test(s)) return Number(s);
  return s;
}

module.exports = { parseTrustProxy };
