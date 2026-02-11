const crypto = require("crypto");
const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-key-12345";

function requireAuth(options = {}) {
  return function authMiddleware(req, res, next) {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];

    // 1. Intentar JWT
    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded; // { id, username, role }
        return next();
      } catch (err) {
        // Token inválido (posiblemente sea una API Key pasada como Bearer)
      }
    }

    // 2. Intentar API Key (Retrocompatibilidad)
    const expectedKey = process.env.API_KEY;
    const providedKey = req.get("x-api-key") || token;

    if (expectedKey && providedKey) {
       try {
          const a = Buffer.from(String(providedKey));
          const b = Buffer.from(String(expectedKey));
          if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
            req.user = { id: 1, username: "system", role: "admin" };
            return next();
          }
       } catch (e) {}
    }

    // 3. Si estamos en DEV sin clave configurada, dejamos pasar
    if (!expectedKey && process.env.NODE_ENV !== "production") {
      req.user = { id: 1, username: "dev-anonymous", role: "admin" };
      return next();
    }

    return res.status(401).json({
      error: {
        code: "unauthorized",
        message: "Autenticación requerida (Token JWT o API Key)",
        requestId: req.id,
      },
    });
  };
}

module.exports = requireAuth;
