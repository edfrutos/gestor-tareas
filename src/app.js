"use strict";

const path = require("path");
const fs = require("fs/promises");
const http = require("http");
const https = require("https");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const morgan = require("morgan");
const IS_PROD = process.env.NODE_ENV === "production";

// Hardening toggles (NO activados por defecto)
const TRUST_PROXY = process.env.TRUST_PROXY ?? "1";      // detrás de Caddy/NGINX (local OK)
const FORCE_HTTPS = process.env.FORCE_HTTPS === "1";     // solo en prod cuando lo decidas
const HSTS_ENABLED = process.env.HSTS_ENABLED === "1";   // solo en prod cuando lo decidas

// Host público confiable para redirects (evita Host header spoofing).
// - PUBLIC_HOST: recomendado (p.ej. "api.ejemplo.com" o "api.ejemplo.com:443")
// - HOSTNAME: fallback típico en contenedores (ojo: a veces es un nombre interno)
const CONFIGURED_PUBLIC_HOST = String(process.env.PUBLIC_HOST || process.env.HOSTNAME || "").trim();

function isValidHostHeaderValue(value) {
  if (!value) return false;
  const host = String(value).trim();
  if (!host) return false;
  if (host.length > 255) return false;

  // Solo permitimos hostname (DNS) opcionalmente con puerto. Sin espacios, slashes ni caracteres de control.
  // Ejemplos válidos: "example.com", "sub.example.com:8443", "localhost:3000", "127.0.0.1:8080"
  // Nota: IPv6 y hosts punycode no se contemplan aquí; añade soporte si lo necesitas.
  if (!/^[a-z0-9.-]+(?::\d{1,5})?$/i.test(host)) return false;

  // Validación básica de puerto si existe
  const m = host.match(/:(\d{1,5})$/);
  if (m) {
    const port = Number(m[1]);
    if (!Number.isInteger(port) || port < 1 || port > 65535) return false;
  }

  return true;
}

function getSafeRedirectHost(req) {
  const headerHost = req && req.headers ? req.headers.host : undefined;
  if (isValidHostHeaderValue(headerHost)) return String(headerHost).trim();
  if (isValidHostHeaderValue(CONFIGURED_PUBLIC_HOST)) return CONFIGURED_PUBLIC_HOST;
  return null;
}

const allowHttpImages =
  process.env.ALLOW_HTTP_IMAGES === "true" || process.env.ALLOW_HTTP_IMAGES === "1";


const app = express();

// -------------------- static: uploads (MUST be first) --------------------
const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, "..", "uploads");

app.use(
  "/uploads",
  express.static(uploadDir, {
    fallthrough: true, // ✅ CLAVE
    etag: true,
    maxAge: IS_PROD ? "7d" : 0,
    setHeaders(res, filePath) {
      // Tipos
      if (filePath.endsWith(".webp")) {
        res.setHeader("Content-Type", "image/webp");
      }
      
      // Forzar inline para documentos
      if (filePath.endsWith(".txt") || filePath.endsWith(".md") || filePath.endsWith(".markdown")) {
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.setHeader("Content-Disposition", "inline");
      }
      if (filePath.endsWith(".pdf")) {
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", "inline");
      }
    
      // Cache agresiva en prod SOLO para imágenes inmutables (uploads)
      // Para UI (app.js, css, html) preferimos validación (ETag) o caché corta
      if (IS_PROD && filePath.includes("/uploads/")) {
        // 30 días + immutable
        res.setHeader("Cache-Control", "public, max-age=2592000, immutable");
      } else {
        // UI code: no-cache obliga a revalidar ETag siempre
        res.setHeader("Cache-Control", "no-cache");
      }
    },
  })
);

// -------------------- logs (limpios) --------------------
function skipHttpLog(req, res) {
  const url = req.originalUrl || req.url || "";
  if (url === "/.well-known/appspecific/com.chrome.devtools.json") return true;
  if (url === "/favicon.ico") return true;
  if (url === "/health") return true;
  if (url.startsWith("/ui/")) return true;
  if (url.startsWith("/uploads/")) return true;
  if (res && res.statusCode === 304) return true;
  return false;
}

app.use(
  morgan(IS_PROD ? "combined" : "dev", {
    skip: (req, res) => skipHttpLog(req, res),
  })
);

app.get("/.well-known/appspecific/com.chrome.devtools.json", (req, res) => {
  res.status(204).end();
});

// -------------------- CORS (UI + API) --------------------
function parseAllowedOrigins(value) {
  if (Array.isArray(value)) {
    const cleaned = value.map((v) => String(v).trim()).filter(Boolean);
    return cleaned;
  }
  if (typeof value === "string") {
    return value.split(",").map((v) => v.trim()).filter(Boolean);
  }
  return [];
}

const explicitAllowed = parseAllowedOrigins(process.env.ALLOWED_ORIGINS);

function isLocalOrigin(origin) {
  try {
    const u = new URL(origin);
    return (
      u.hostname === "localhost" ||
      u.hostname === "127.0.0.1"
    );
  } catch {
    return false;
  }
}

const corsOptions = {
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (explicitAllowed.length > 0) {
      return cb(null, explicitAllowed.includes(origin));
    }
    if (!IS_PROD && isLocalOrigin(origin)) return cb(null, true);
    return cb(null, false);
  },
  credentials: true,
};

app.use(cors(corsOptions));

app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        "default-src": ["'self'"],
        "script-src": ["'self'", "https://unpkg.com"],
        "script-src-elem": ["'self'", "https://unpkg.com"],
        "style-src": ["'self'", "https://unpkg.com", "'unsafe-inline'"],
        "style-src-elem": ["'self'", "https://unpkg.com", "'unsafe-inline'"],
        "img-src": [
          "'self'",
          "data:",
          "blob:",
          "https:",
          ...(allowHttpImages ? ["http:"] : []),
        ],
        "connect-src": [
          "'self'",
          "https://unpkg.com",
        ],
        "font-src": ["'self'", "https:", "data:"],
        "object-src": ["'none'"],
        "frame-ancestors": ["'self'"],
        "base-uri": ["'self'"],
        "form-action": ["'self'"],
      },
    },
    hsts: HSTS_ENABLED
      ? {
          maxAge: 15552000,
          includeSubDomains: true,
          preload: false,
        }
      : false,
    crossOriginEmbedderPolicy: false,
  })
);

app.use(compression());

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

// estáticos
app.use("/ui", express.static(path.join(__dirname, "public", "ui"), { fallthrough: true }));
app.use(express.static(path.join(__dirname, "public"), { fallthrough: true }));

// home
app.get("/", (req, res) => {
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// health
app.get("/health", async (req, res) => {
  const startedAt = Date.now();
  const timestamp = new Date().toISOString();

  const [db, uploads, external] = await Promise.all([
    checkDatabaseConnection(),
    checkUploadsDir(),
    checkExternalService(),
  ]);

  const dependencies = { database: db, uploads, externalService: external };
  const requiredOk = Boolean(db.ok) && Boolean(uploads.ok);
  const overallOk = requiredOk && (external.skipped === true || Boolean(external.ok));

  res.status(overallOk ? 200 : 503).json({
    ok: overallOk,
    timestamp,
    uptimeSec: Math.floor(process.uptime()),
    latencyMs: msSince(startedAt),
    dependencies,
  });
});

const cookieParser = require("cookie-parser");
const { doubleCsrf } = require("csrf-csrf");

// cookies
app.use(cookieParser());

// CSRF (solo si lo activas por env)
const CSRF_ENABLED = process.env.CSRF_ENABLED === "1";

let csrf;
if (CSRF_ENABLED) {
  const CSRF_SECRET = String(process.env.CSRF_SECRET || "").trim();
  if (!CSRF_SECRET) {
    // En prod o en cualquier entorno donde lo actives, exigimos un secreto real.
    // Evita que el servicio arranque con un fallback inseguro.
    console.error("[FATAL] CSRF_ENABLED=1 pero CSRF_SECRET está vacío. Define CSRF_SECRET y reinicia.");
    process.exit(1);
  }

  // Por defecto: cookies secure solo en producción (HTTPS). Puedes sobreescribirlo
  // explícitamente con CSRF_COOKIE_SECURE=1/0 (útil si tienes HTTPS local con proxy).
  const CSRF_COOKIE_SECURE_ENV = String(process.env.CSRF_COOKIE_SECURE || "").trim().toLowerCase();
  const CSRF_COOKIE_SECURE =
    CSRF_COOKIE_SECURE_ENV === "1" || CSRF_COOKIE_SECURE_ENV === "true"
      ? true
      : CSRF_COOKIE_SECURE_ENV === "0" || CSRF_COOKIE_SECURE_ENV === "false"
        ? false
        : IS_PROD;

  // El prefijo "__Host-" exige Secure + path "/" (y sin Domain). En HTTP local rompería.
  const CSRF_COOKIE_NAME = CSRF_COOKIE_SECURE ? "__Host-cc_csrf" : "cc_csrf";

  csrf = doubleCsrf({
    getSecret: () => CSRF_SECRET,
    cookieName: CSRF_COOKIE_NAME,
    cookieOptions: {
      httpOnly: true,
      sameSite: "lax",
      secure: CSRF_COOKIE_SECURE,
      path: "/",
    },
    size: 64,
    ignoredMethods: ["GET", "HEAD", "OPTIONS"],
  });

  // Token endpoint para la UI
  app.get("/v1/csrf", (req, res) => {
    const token = csrf.generateToken(req, res);
    res.json({ token });
  });

  // Protege SOLO los métodos que mutan
  // (montado tanto en /v1 como en /api para evitar bypass por compatibilidad de rutas)
  const protectMutatingRequestsWithCsrf = (req, res, next) => {
    if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
      return csrf.doubleCsrfProtection(req, res, next);
    }
    return next();
  };

  app.use("/v1", protectMutatingRequestsWithCsrf);
  app.use("/api", protectMutatingRequestsWithCsrf);
}

// Ruta de configuración (NO expone secretos; solo flags públicos)
app.get("/v1/config", (req, res) => {
  // IMPORTANTE: NO devolver API_KEY (secreto). Si necesitas exponer un identificador
  // público para el cliente (no autenticación), usa PUBLIC_API_IDENTIFIER.
  const publicApiIdentifier = process.env.PUBLIC_API_IDENTIFIER || null;
  const csrfEnabled = process.env.CSRF_ENABLED === "1";
  res.json({ publicApiIdentifier, csrfEnabled });
});

const issuesRoutes = require("./routes/issues.routes");
const photosRoutes = require("./routes/photos.routes");

// -------------------- rate limit (API) --------------------
const { makeRateLimiter } = require("./middleware/rateLimit");

const RATE_LIMIT_ENABLED = process.env.RATE_LIMIT_ENABLED === "1";
const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000);
const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX || 180);

if (RATE_LIMIT_ENABLED) {
  const apiLimiter = makeRateLimiter({
    windowMs: RATE_LIMIT_WINDOW_MS,
    max: RATE_LIMIT_MAX,
    keyPrefix: "api",
    skip: (req) => req.method === "OPTIONS",
  });

  // aplica a /v1 y /api (NO afecta a /ui ni /uploads)
  app.use(["/v1", "/api"], apiLimiter);
}

// La UI suele usar API_BASE="/v1". Mantenemos /api por compatibilidad.
app.use("/v1/issues", issuesRoutes);
app.use("/v1/photos", photosRoutes);
app.use("/api/issues", issuesRoutes);
app.use("/api/photos", photosRoutes);

// 404
app.use((req, res) => {
  res.status(404).json({ error: "Not Found" });
});

// Error handler global
app.use((err, req, res, next) => {
  console.error("[Global Error]", err);
  const status = Number(err.status) || 500;
  res.status(status).json({
    error: {
      message: err.message || "Internal Server Error",
      code: err.code || "internal_error",
      data: err.data || null,
    },
  });
});

module.exports = app;