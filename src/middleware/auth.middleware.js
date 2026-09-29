const crypto = require("crypto");
const { resolveSessionUser } = require("../services/session.service");

function forbidden(res) {
  return res.status(403).json({
    error: { code: "forbidden", message: "Acceso denegado: Se requiere rol de administrador" },
  });
}

function requireAuth(options = {}) {
  const requiredRole = typeof options === "string" ? options : options?.role;

  return async function authMiddleware(req, res, next) {
    try {
      const authHeader = req.headers["authorization"];
      const token = authHeader && authHeader.split(" ")[1];

      // 1. Intentar JWT (contrastado con la BD: usuario existente, sesión no
      //    revocada y rol actual; ver session.service.js)
      if (token) {
        const user = await resolveSessionUser(token);
        if (user) {
          req.user = user; // { id, username, email, role, token_version }
          req.authMethod = "jwt";
          if (requiredRole && req.user.role !== requiredRole) return forbidden(res);
          return next();
        }
        // Token inválido/revocado (o una API Key pasada como Bearer)
      }

      // 2. Intentar API Key (Retrocompatibilidad)
      const expectedKey = process.env.API_KEY;
      const providedKey = req.get("x-api-key") || token;

      if (expectedKey && providedKey) {
        const a = Buffer.from(String(providedKey));
        const b = Buffer.from(String(expectedKey));
        if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
          req.user = { id: 1, username: "system", role: "admin" };
          req.authMethod = "apikey";
          if (requiredRole && req.user.role !== requiredRole) return forbidden(res);
          return next();
        }
      }

      // 3. Si estamos en DEV sin clave configurada, dejamos pasar (no en test: los tests deben verificar auth real)
      if (!expectedKey && process.env.NODE_ENV !== "production" && process.env.NODE_ENV !== "test") {
        req.user = { id: 1, username: "dev-anonymous", role: "admin" };
        req.authMethod = "dev";
        if (requiredRole && req.user.role !== requiredRole) return forbidden(res);
        return next();
      }

      return res.status(401).json({
        error: {
          code: "unauthorized",
          message: "Autenticación requerida (Token JWT o API Key)",
          requestId: req.id,
        },
      });
    } catch (err) {
      return next(err);
    }
  };
}

module.exports = requireAuth;
