// src/middleware/logger.js
// Logging estándar (JSON) usando `pino` + `pino-http`.
// - Exporta `logger` (instancia de pino con .info/.warn/.error/.debug)
// - Exporta `httpLogger()` (middleware Express basado en pino-http)
//
// Nota: `pino-http` genera `req.id` (y lo reutilizamos como x-request-id).

const crypto = require("crypto");
const pino = require("pino");
const pinoHttp = require("pino-http");

const logger = pino({
  level: String(process.env.LOG_LEVEL || "info").toLowerCase(),
});

function genReqId(req, res) {
  const id =
    req.headers["x-request-id"] ||
    crypto.randomUUID?.() ||
    crypto.randomBytes(16).toString("hex");

  // Exponemos el id para correlación en clientes/proxys.
  try {
    res.setHeader("x-request-id", String(id));
  } catch (err) {
    // Mantener el comportamiento defensivo: no bloquear la request por esto.
    try {
      if (logger && typeof logger.debug === "function") {
        logger.debug({ err }, "Failed to set x-request-id header");
      } else if (typeof console?.debug === "function") {
        console.debug("Failed to set x-request-id header", err);
      }
    } catch (_err) {
      // noop
    }
  }

  return String(id);
}

function httpLogger(options = {}) {
  return pinoHttp({
    logger,
    genReqId,
    ...options,
  });
}

module.exports = { logger, httpLogger };