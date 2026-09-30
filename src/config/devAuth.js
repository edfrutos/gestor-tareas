// src/config/devAuth.js
"use strict";

/**
 * Acceso sin credenciales como admin, SOLO para desarrollo local y solo si se
 * pide explícitamente. Antes bastaba con que faltara API_KEY y NODE_ENV no
 * fuera "production"/"test": un NODE_ENV vacío o mal escrito dejaba la API
 * abierta. Ahora hacen falta las tres condiciones.
 */
function devAuthBypassEnabled(env = process.env) {
  return env.DEV_AUTH_BYPASS === "1" && env.NODE_ENV === "development" && !env.API_KEY;
}

const DEV_USER = Object.freeze({ id: 1, username: "dev-anonymous", role: "admin" });

let warned = false;
function warnDevAuthBypass(logger = console) {
  if (warned) return;
  warned = true;
  logger.warn("[security] DEV_AUTH_BYPASS=1: peticiones sin credenciales entran como admin. Solo para desarrollo local.");
}

module.exports = { devAuthBypassEnabled, DEV_USER, warnDevAuthBypass };
