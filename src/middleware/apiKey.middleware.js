// src/middleware/apiKey.middleware.js
const crypto = require("crypto");

/**
 * Middleware: exige API key en mutaciones.
 * - Lee la clave esperada de process.env.API_KEY
 * - Acepta:
 *    - header "x-api-key: <key>"
 *    - header "authorization: Bearer <key>"
 *
 * Comportamiento:
 * - Si API_KEY NO está definida:
 *    - En production -> 500 misconfigured
 *    - En dev/test   -> deja pasar (para no bloquearte)
 */
function requireApiKey(options = {}) {
  const {
    headerName = "x-api-key",
    allowIfMissingInDev = true,
  } = options;

  return function apiKeyMiddleware(req, res, next) {
    const expected = process.env.API_KEY;

    if (!expected) {
      const isProd = process.env.NODE_ENV === "production";
      if (isProd || !allowIfMissingInDev) {
        return res.status(500).json({
          error: {
            code: "misconfigured",
            message: "API_KEY no está configurada en el servidor",
            requestId: req.id,
          },
        });
      }
      // dev/test sin API_KEY: no bloqueamos
      return next();
    }

    const fromHeader = req.get(headerName);
    const auth = req.get("authorization");

    let provided = fromHeader;
    if (!provided && auth && auth.toLowerCase().startsWith("bearer ")) {
      provided = auth.slice(7).trim();
    }

    if (!provided) {
      return res.status(401).json({
        error: {
          code: "unauthorized",
          message: "Falta API key (x-api-key o Authorization: Bearer ...)",
          requestId: req.id,
        },
      });
    }

    // Comparación segura
    try {
      const a = Buffer.from(String(provided));
      const b = Buffer.from(String(expected));

      const ok =
        a.length === b.length && crypto.timingSafeEqual(a, b);

      if (!ok) {
        return res.status(401).json({
          error: {
            code: "unauthorized",
            message: "API key inválida",
            requestId: req.id,
          },
        });
      }
    } catch (_e) {
      return res.status(401).json({
        error: {
          code: "unauthorized",
          message: "API key inválida",
          requestId: req.id,
        },
      });
    }

    next();
  };
}

module.exports = requireApiKey;