// src/config/secrets.js
"use strict";

const jwt = require("jsonwebtoken");

// Solo para desarrollo/tests. En producción no se admite: quien lo conozca
// podría firmar tokens válidos.
const DEV_JWT_SECRET = "dev-secret-key-12345";

// Valores de ejemplo de .env.example y de la documentación.
const PLACEHOLDER_SECRETS = new Set([
  DEV_JWT_SECRET,
  "change_this_in_production",
  "changeme",
  "secret",
]);

const MIN_RECOMMENDED_LENGTH = 32;

function resolveJwtSecret(env = process.env) {
  const secret = String(env.JWT_SECRET || "").trim();
  const isProd = env.NODE_ENV === "production";

  if (!secret || PLACEHOLDER_SECRETS.has(secret)) {
    if (isProd) {
      throw new Error(
        "[FATAL] JWT_SECRET no está definido o usa un valor de ejemplo. " +
        "Genera uno con `openssl rand -base64 48`, ponlo en el .env y reinicia."
      );
    }
    return secret || DEV_JWT_SECRET;
  }

  if (isProd && secret.length < MIN_RECOMMENDED_LENGTH) {
    console.warn(
      `[security] JWT_SECRET tiene ${secret.length} caracteres; se recomiendan al menos ${MIN_RECOMMENDED_LENGTH}.`
    );
  }
  return secret;
}

const JWT_SECRET = resolveJwtSecret();

function signToken(payload, options = {}) {
  return jwt.sign(payload, JWT_SECRET, { algorithm: "HS256", ...options });
}

/** Devuelve el payload o lanza si el token no es válido. */
function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET, { algorithms: ["HS256"] });
}

module.exports = { resolveJwtSecret, signToken, verifyToken };
