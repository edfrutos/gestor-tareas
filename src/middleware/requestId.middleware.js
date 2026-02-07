// src/middleware/requestId.middleware.js
const crypto = require("crypto");

module.exports = function requestIdMiddleware() {
  return function requestId(req, res, next) {
    const id =
      req.headers["x-request-id"] ||
      crypto.randomUUID?.() ||
      crypto.randomBytes(16).toString("hex");

    req.id = String(id);
    res.setHeader("x-request-id", req.id);
    next();
  };
};