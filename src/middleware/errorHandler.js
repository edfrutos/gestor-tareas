// src/middleware/errorHandler.js
"use strict";

const { ZodError } = require("zod");

/**
 * Manejador global de errores. Los 4xx devuelven su mensaje; los 5xx solo
 * un mensaje genérico (el detalle va al log).
 */
function errorHandler(err, req, res, _next) {
  let status = Number(err.status || err.statusCode) || 500;
  let code = err.code || "internal_error";
  let message = err.message || "Internal Server Error";
  let data = err.data || null;

  if (err instanceof ZodError) {
    status = 400;
    code = "validation_error";
    message = err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ");
    data = err.issues;
  } else if (err.name === "MulterError") {
    // Límites de multer (tamaño, nº de ficheros, campo inesperado)
    status = err.code === "LIMIT_FILE_SIZE" ? 413 : 400;
  }

  if (status >= 500) {
    // El detalle (SQL, rutas, stack) solo va al log, nunca al cliente.
    console.error("[Global Error]", { requestId: req.id, method: req.method, url: req.originalUrl }, err);
    code = "internal_error";
    message = "Internal Server Error";
    data = null;
  }

  res.status(status).json({ error: { message, code, data } });
}

module.exports = errorHandler;
