// src/routes/issues.routes.js
const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const multer = require("multer");
const sharp = require("sharp");

const { run, all, get } = require("../db/sqlite");
const requireApiKey = require("../middleware/apiKey.middleware");
const { getUploadDir, getThumbsDir } = require("../config/paths");

const router = express.Router();

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

// uploads dir
const uploadDir = getUploadDir();
const thumbsDir = getThumbsDir();
ensureDir(uploadDir);
ensureDir(thumbsDir);

// multer
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase() || ".bin";
    const id = crypto.randomBytes(6).toString("hex");
    let prefix = "doc";
    if (file.fieldname === "photo" || file.fieldname === "resolution_photo") prefix = "photo";
    cb(null, `${prefix}_${Date.now()}_${id}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: Number(process.env.MAX_UPLOAD_BYTES || 8 * 1024 * 1024),
  },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    
    // Filtros por campo
    if (file.fieldname === "photo" || file.fieldname === "resolution_photo") {
      const allowedExts = [".jpg", ".jpeg", ".png", ".webp", ".gif"];
      if (allowedExts.includes(ext)) return cb(null, true);
      const allowedMimeTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
      if (allowedMimeTypes.includes(file.mimetype)) return cb(null, true);

    } else if (file.fieldname === "file" || file.fieldname === "resolution_doc") {
      const allowedExts = [".pdf", ".txt", ".md", ".markdown"];
      if (allowedExts.includes(ext)) return cb(null, true);
      const allowedMimeTypes = ["application/pdf", "text/plain", "text/markdown"];
      if (allowedMimeTypes.includes(file.mimetype)) return cb(null, true);
    }

    const err = new Error(`Tipo de archivo no permitido en campo ${file.fieldname}: ${ext || file.mimetype}`);
    err.status = 400;
    return cb(err, false);
  },
});

const uploadMiddleware = upload.fields([
  { name: "photo", maxCount: 1 },
  { name: "file", maxCount: 1 },
  { name: "resolution_photo", maxCount: 1 },
  { name: "resolution_doc", maxCount: 1 }
]);

function toInt(v, def) {
  const n = Number.parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) ? n : def;
}
function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}
function toNum(v) {
  if (typeof v === "string") {
    v = v.replace(",", ".");
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

function photoToThumbUrl(photoUrl) {
  if (!photoUrl) return null;
  if (!photoUrl.startsWith("/uploads/")) return null;
  const filename = photoUrl.replace("/uploads/", "");
  return `/uploads/thumbs/${filename}.webp`;
}

async function makeThumbIfNeeded(photoFilename) {
  const srcPath = path.join(uploadDir, photoFilename);
  const dstPath = path.join(thumbsDir, `${photoFilename}.webp`);

  if (fs.existsSync(dstPath)) return;

  // Solo procesar si es una imagen
  const ext = path.extname(photoFilename).toLowerCase();
  const imageExts = [".jpg", ".jpeg", ".png", ".webp", ".gif"];
  if (!imageExts.includes(ext)) return;

  try {
    await sharp(srcPath)
      .rotate()
      .resize(256, 256, { fit: "cover" })
      .webp({ quality: 78 })
      .toFile(dstPath);
  } catch (err) {
    console.error("Error generating thumb:", err);
  }
}

// GET /v1/issues?page=1&pageSize=10&status=open&category=alumbrado&q=farola&order=new|old|cat|status (legacy: sort=newest|oldest)
router.get("/", async (req, res, next) => {
  try {
    const page = clamp(toInt(req.query.page, 1), 1, 10_000);
    const pageSize = clamp(toInt(req.query.pageSize, 10), 1, 100);
    const offset = (page - 1) * pageSize;

    const status = req.query.status ? String(req.query.status) : "";
    const category = req.query.category ? String(req.query.category) : "";
    const q = req.query.q ? String(req.query.q).trim() : "";

    // UI nueva manda `order=new|old|cat|status`. Por compatibilidad aceptamos `sort=newest|oldest`.
    const orderRaw = req.query.order ? String(req.query.order) : "";
    const sortLegacy = req.query.sort ? String(req.query.sort) : "";

    let order = (orderRaw || "").trim();
    if (!order && sortLegacy) {
      order = sortLegacy.trim() === "oldest" ? "old" : "new";
    }
    if (!order) order = "new";

    // allowlist
    if (!["new", "old", "cat", "status"].includes(order)) order = "new";

    const where = [];
    const params = [];

    if (status) {
      where.push("status = ?");
      params.push(status);
    }
    if (category) {
      where.push("category = ?");
      params.push(category);
    }
    if (q) {
      where.push("(title LIKE ? OR description LIKE ?)");
      params.push(`%${q}%`, `%${q}%`);
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    let orderSql = "ORDER BY datetime(created_at) DESC"; // default: new

    if (order === "old") {
      orderSql = "ORDER BY datetime(created_at) ASC";
    } else if (order === "cat") {
      // por categoría (alfabético), y dentro por más nuevas
      orderSql = "ORDER BY lower(category) ASC, datetime(created_at) DESC";
    } else if (order === "status") {
      // open -> in_progress -> resolved, y dentro por más nuevas
      orderSql = `ORDER BY CASE status
        WHEN 'open' THEN 0
        WHEN 'in_progress' THEN 1
        WHEN 'resolved' THEN 2
        ELSE 9
      END ASC, datetime(created_at) DESC`;
    }

    const items = await all(
      `
      SELECT id, title, category, description, lat, lng, photo_url, thumb_url, text_url, resolution_photo_url, resolution_thumb_url, resolution_text_url, status, created_at
      FROM issues
      ${whereSql}
      ${orderSql}
      LIMIT ? OFFSET ?
      `,
      [...params, pageSize, offset]
    );

    const row = await get(`SELECT COUNT(*) AS total FROM issues ${whereSql}`, params);

    const withThumbs = items.map((it) => ({
      ...it,
      resolution_thumb_url: it.resolution_photo_url ? photoToThumbUrl(it.resolution_photo_url) : null,
    }));

    // Evita cacheos raros del navegador
    res.setHeader("Cache-Control", "no-store");
    res.json({
      page,
      pageSize,
      total: row ? row.total : 0,
      items: withThumbs,
    });
  } catch (e) {
    next(e);
  }
});

// GET /v1/issues/categories
router.get("/categories", async (req, res, next) => {
  try {
    const rows = await all(`SELECT DISTINCT category FROM issues WHERE category IS NOT NULL AND category != '' ORDER BY category ASC`);
    const dbCats = rows.map(r => r.category);
    const defaults = ["alumbrado", "limpieza", "baches", "ruido", "otros"];
    // Unificar y ordenar
    const merged = Array.from(new Set([...defaults, ...dbCats])).sort((a, b) => a.localeCompare(b));
    
    res.json(merged);
  } catch (e) {
    next(e);
  }
});

// POST /v1/issues (multipart con file opcional) - API KEY requerida
router.post("/", requireApiKey(), (req, res, next) => {
  uploadMiddleware(req, res, (err) => {
    if (err) {
      const status = err.status || 400;
      return res.status(status).json({ error: { code: "upload_error", message: err.message } });
    }
    next();
  });
}, async (req, res, next) => {
  try {
    const body = req.body || {};

    const title = body.title != null ? String(body.title).trim() : "";
    const category = body.category != null ? String(body.category).trim() : "";
    const description = body.description != null ? String(body.description).trim() : "";

    const lat = toNum(body.lat);
    const lng = toNum(body.lng);

    if (!title || !category || !description || Number.isNaN(lat) || Number.isNaN(lng)) {
      return res.status(400).json({
        error: {
          code: "bad_request",
          message: "Campos requeridos: title, category, description, lat, lng",
          requestId: req.id,
        },
      });
    }

    const createdAt = new Date().toISOString();

    let photoUrl = null;
    let thumbUrl = null;
    let textUrl = null;

    // Procesar Foto
    if (req.files && req.files["photo"] && req.files["photo"][0]) {
      const f = req.files["photo"][0];
      photoUrl = `/uploads/${f.filename}`;
      thumbUrl = photoToThumbUrl(photoUrl);

      // Generar thumb
      try {
        await makeThumbIfNeeded(f.filename);
      } catch (_e) { /* ignore */ }
    }

    // Procesar Documento
    if (req.files && req.files["file"] && req.files["file"][0]) {
      const f = req.files["file"][0];
      textUrl = `/uploads/${f.filename}`;
    }

    const result = await run(
      `
      INSERT INTO issues (title, category, description, lat, lng, photo_url, thumb_url, text_url, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)
      `,
      [title, category, description, lat, lng, photoUrl, thumbUrl, textUrl, createdAt]
    );

    const created = await get(
      `SELECT * FROM issues WHERE id = ?`,
      [result.lastID]
    );

    res.setHeader("Cache-Control", "no-store");
    res.status(201).json(created);
  } catch (e) {
    next(e);
  }
});

// PATCH /v1/issues/:id (multipart opcional: status, description, resolution_file)
router.patch("/:id", requireApiKey(), (req, res, next) => {
  uploadMiddleware(req, res, (err) => {
      if (err) return res.status(400).json({ error: { code: "upload_error", message: err.message } });
      next();
  });
}, async (req, res, next) => {
  try {
    const id = toInt(req.params.id, 0);
    const body = req.body || {};
    
    // Permitir updates parciales
    const status = body.status ? String(body.status) : null;
    const description = body.description ? String(body.description).trim() : null;

    if (!id) {
      return res.status(400).json({
        error: { code: "bad_request", message: "id inválido", requestId: req.id },
      });
    }

    const updates = [];
    const params = [];

    // Validar status si viene
    if (status) {
      const allowed = new Set(["open", "in_progress", "resolved"]);
      if (!allowed.has(status)) {
        return res.status(400).json({
          error: { code: "bad_request", message: "status inválido", requestId: req.id },
        });
      }
      updates.push("status = ?");
      params.push(status);
    }

    // Validar description si viene
    if (description !== null) {
      updates.push("description = ?");
      params.push(description);
    }

    // Procesar foto original reemplazo
    if (req.files && req.files["photo"] && req.files["photo"][0]) {
      const f = req.files["photo"][0];
      const photoUrl = `/uploads/${f.filename}`;
      const thumbUrl = photoToThumbUrl(photoUrl);

      updates.push("photo_url = ?");
      params.push(photoUrl);
      
      updates.push("thumb_url = ?");
      params.push(thumbUrl);

      try {
        await makeThumbIfNeeded(f.filename);
      } catch (_e) { /* ignore */ }
    }

    // Procesar documento original reemplazo
    if (req.files && req.files["file"] && req.files["file"][0]) {
      const f = req.files["file"][0];
      const textUrl = `/uploads/${f.filename}`;

      updates.push("text_url = ?");
      params.push(textUrl);
    }

    // Procesar foto de resolución
    if (req.files && req.files["resolution_photo"] && req.files["resolution_photo"][0]) {
      const f = req.files["resolution_photo"][0];
      const photoUrl = `/uploads/${f.filename}`;
      const thumbUrl = photoToThumbUrl(photoUrl);

      updates.push("resolution_photo_url = ?");
      params.push(photoUrl);
      
      updates.push("resolution_thumb_url = ?");
      params.push(thumbUrl);

      try {
        await makeThumbIfNeeded(f.filename);
      } catch (_e) { /* ignore */ }
    }

    // Procesar documento de resolución
    if (req.files && req.files["resolution_doc"] && req.files["resolution_doc"][0]) {
      const f = req.files["resolution_doc"][0];
      const textUrl = `/uploads/${f.filename}`;

      updates.push("resolution_text_url = ?");
      params.push(textUrl);
    }

    if (updates.length === 0) {
       return res.status(400).json({
        error: { code: "bad_request", message: "No hay campos para actualizar", requestId: req.id },
      });
    }

    // Ejecutar UPDATE
    params.push(id);
    await run(`UPDATE issues SET ${updates.join(", ")} WHERE id = ?`, params);

    const updated = await get(
      `SELECT * FROM issues WHERE id = ?`,
      [id]
    );

    if (!updated) {
      return res.status(404).json({
        error: { code: "not_found", message: "Issue no encontrada", requestId: req.id },
      });
    }

    res.setHeader("Cache-Control", "no-store");
    res.json({
      ...updated,
      thumb_url: updated.photo_url ? photoToThumbUrl(updated.photo_url) : null,
      resolution_thumb_url: updated.resolution_photo_url ? photoToThumbUrl(updated.resolution_photo_url) : null,
    });
  } catch (e) {
    console.error("PATCH Error:", e);
    // Propagar el error con detalles para el cliente
    e.status = e.status || 500;
    next(e);
  }
});

// DELETE /v1/issues/:id
router.delete("/:id", requireApiKey(), async (req, res, next) => {
  try {
    const id = toInt(req.params.id, 0);
    if (!id) {
      return res.status(400).json({
        error: { code: "bad_request", message: "id inválido", requestId: req.id },
      });
    }

    const row = await get(`SELECT photo_url, resolution_photo_url FROM issues WHERE id = ?`, [id]);
    await run(`DELETE FROM issues WHERE id = ?`, [id]);

    if (row) {
      const urls = [row.photo_url, row.resolution_photo_url].filter((u) => u && u.startsWith("/uploads/"));
      urls.forEach((u) => {
        const filename = u.replace("/uploads/", "");
        const photoPath = path.join(uploadDir, filename);
        const thumbPath = path.join(thumbsDir, `${filename}.webp`);
        fs.unlink(photoPath, () => {});
        fs.unlink(thumbPath, () => {});
      });
    }

    res.setHeader("Cache-Control", "no-store");
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

module.exports = router;