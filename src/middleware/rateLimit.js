"use strict";

/**
 * Rate limiter simple en memoria (por IP + ruta base).
 * - Sin dependencias
 * - Suficiente para local/proxy y un VPS pequeño
 * - Para multi-replica real: Redis/NGINX/Caddy rate-limit
 */

function getClientIp(req) {
  // If trust proxy is enabled, prefer req.ip (Express handles XFF correctly)
  // Otherwise, use socket address to prevent IP spoofing
  if (req.app && typeof req.app.get === "function" && req.app.get("trust proxy")) {
    return req.ip || (req.socket && req.socket.remoteAddress) || "unknown";
  }
  return (req.socket && req.socket.remoteAddress) || "unknown";
}

function makeRateLimiter({
  windowMs = 60000,
  max = 120,
  keyPrefix = "rl",
  skip = () => false,
  onLimit = null,
  // Solo cuentan las respuestas con error (>= 400): útil contra fuerza bruta
  // sin penalizar el uso normal.
  skipSuccessfulRequests = false,
  // false: un único contador por IP aunque el router esté montado en varias
  // rutas base (p. ej. /v1/auth y /api/auth).
  groupByBasePath = true,
} = {}) {
  const buckets = new Map(); // key => { resetAt, count }

  // GC ligero para no crecer infinito
  const gcEvery = Math.max(10000, Math.floor(windowMs / 2));
  let lastGc = Date.now();

  function gc(now) {
    if (now - lastGc < gcEvery) return;
    lastGc = now;
    for (const [k, v] of buckets.entries()) {
      if (v.resetAt <= now) buckets.delete(k);
    }
  }

  return function rateLimit(req, res, next) {
    try {
      if (skip(req, res)) return next();

      const now = Date.now();
      gc(now);

      const ip = getClientIp(req);
      // segmenta por base path para no mezclar UI y API
      const originalUrl = req.originalUrl || "";
      const base =
        req.baseUrl || (originalUrl.startsWith("/v1") ? "/v1" : originalUrl.startsWith("/api") ? "/api" : "");

      const key = groupByBasePath ? `${keyPrefix}:${ip}:${base}` : `${keyPrefix}:${ip}`;

      const refundIfSuccessful = (bucket) => {
        if (!skipSuccessfulRequests) return;
        res.on("finish", () => {
          if (res.statusCode < 400 && buckets.get(key) === bucket) {
            bucket.count = Math.max(0, bucket.count - 1);
          }
        });
      };

      const b = buckets.get(key);
      if (!b || b.resetAt <= now) {
        const fresh = { resetAt: now + windowMs, count: 1 };
        buckets.set(key, fresh);
        refundIfSuccessful(fresh);
        res.setHeader("X-RateLimit-Limit", String(max));
        res.setHeader("X-RateLimit-Remaining", String(max - 1));
        res.setHeader("X-RateLimit-Reset", String(Math.floor((now + windowMs) / 1000)));
        return next();
      }

      b.count += 1;
      refundIfSuccessful(b);

      const remaining = Math.max(0, max - b.count);
      res.setHeader("X-RateLimit-Limit", String(max));
      res.setHeader("X-RateLimit-Remaining", String(remaining));
      res.setHeader("X-RateLimit-Reset", String(Math.floor(b.resetAt / 1000)));

      if (b.count > max) {
        if (typeof onLimit === "function") onLimit(req, res, b);
        const retryAfter = Math.max(1, Math.ceil((b.resetAt - now) / 1000));
        res.setHeader("Retry-After", String(retryAfter));
        return res.status(429).json({
          error: "Too Many Requests",
          retryAfterSec: retryAfter,
        });
      }
      return next();
    } catch (e) {
      void e;
      // Fail-open (no rompemos el API por el limiter)
      return next();
    }
  };
}

module.exports = { makeRateLimiter };