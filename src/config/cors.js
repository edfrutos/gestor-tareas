// src/config/cors.js
"use strict";

// Regla de orígenes permitidos, común a Express y a Socket.io.
// - ALLOWED_ORIGINS (lista separada por comas): solo esos.
// - Sin ALLOWED_ORIGINS: localhost/127.0.0.1 fuera de producción; nada en producción.
// - Peticiones sin cabecera Origin (mismo origen, app de macOS, curl): permitidas.

function parseAllowedOrigins(value) {
  if (Array.isArray(value)) {
    return value.map((v) => String(v).trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value.split(",").map((v) => v.trim()).filter(Boolean);
  }
  return [];
}

function isLocalOrigin(origin) {
  try {
    const u = new URL(origin);
    return u.hostname === "localhost" || u.hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

function makeOriginChecker(env = process.env) {
  const explicitAllowed = parseAllowedOrigins(env.ALLOWED_ORIGINS);
  const isProd = env.NODE_ENV === "production";

  return function checkOrigin(origin, cb) {
    if (!origin) return cb(null, true);
    if (explicitAllowed.length > 0) return cb(null, explicitAllowed.includes(origin));
    if (!isProd && isLocalOrigin(origin)) return cb(null, true);
    return cb(null, false);
  };
}

module.exports = { parseAllowedOrigins, makeOriginChecker };
