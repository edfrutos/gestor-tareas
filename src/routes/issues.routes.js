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
const { createIssueSchema, updateIssueSchema, getIssuesSchema } = require("../schemas/issue.schema");

const router = express.Router();

function validateSchema(schema, data) {
  const result = schema.safeParse(data);
  if (!result.success) {
    const issues = result.error.issues || [];
    const errorMessages = issues.map((e) => `${e.path.join(".")}: ${e.message}`).join(", ");
    const err = new Error(`Validation Error: ${errorMessages}`);
    err.status = 400;
    throw err;
  }
  return result.data;
}

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

function deleteFileByUrl(url) {
  if (!url || !url.startsWith("/uploads/")) return;
  const filename = url.replace("/uploads/", "");
  const filepath = path.join(uploadDir, filename);
  
  fs.unlink(filepath, (err) => {
    if (err && err.code !== "ENOENT") console.error(`Error deleting file ${filepath}:`, err);
  });

  // Intentar borrar thumb si es imagen (por si acaso)
  const thumbPath = path.join(thumbsDir, `${filename}.webp`);
  fs.unlink(thumbPath, (err) => {
    if (err && err.code !== "ENOENT") {
      // Ignoramos error en thumb porque no todos los archivos tienen thumb
    }
  });
}

// Helper para construir cláusula WHERE
function buildWhereClause(query) {
  const { status, category, q, from, to } = query;
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
  if (from) {
    where.push("created_at >= ?");
    params.push(`${from}T00:00:00`);
  }
  if (to) {
    where.push("created_at <= ?");
    params.push(`${to}T23:59:59`);
  }

  return {
    sql: where.length ? `WHERE ${where.join(" AND ")}` : "",
    params
  };
}

async function logChange(issueId, action, oldValue = null, newValue = null) {
  const createdAt = new Date().toISOString();
  try {
    await run(
      `INSERT INTO issue_logs (issue_id, action, old_value, new_value, created_at) VALUES (?, ?, ?, ?, ?)`,
      [issueId, action, oldValue ? String(oldValue) : null, newValue ? String(newValue) : null, createdAt]
    );
  } catch (err) {
    console.error(`Error logging change for issue ${issueId}:`, err);
  }
}

// GET /v1/issues?page=1&pageSize=10&status=open&category=alumbrado&q=farola&order=new|old|cat|status (legacy: sort=newest|oldest)
router.get("/", async (req, res, next) => {
  try {
    const query = validateSchema(getIssuesSchema, req.query);
    const { page, pageSize, status, category, q, sort } = query;
    let { order } = query;

    // Legacy support logic moved from manual parsing
    const orderRaw = req.query.order ? String(req.query.order) : "";
    const sortLegacy = req.query.sort ? String(req.query.sort) : "";

    if (!orderRaw && sortLegacy) {
      order = sortLegacy.trim() === "oldest" ? "old" : "new";
    }
    
    // Default fallback provided by schema, but ensure valid enum if legacy overrode it poorly (though schema catches most)
    if (!["new", "old", "cat", "status"].includes(order)) order = "new";

    const offset = (page - 1) * pageSize;
    const { sql: whereSql, params } = buildWhereClause(query);

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

// GET /v1/issues/:id/logs
router.get("/:id/logs", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!id || !Number.isInteger(id)) {
      return res.status(400).json({ error: { code: "bad_request", message: "ID inválido" } });
    }
    const logs = await all(
      `SELECT * FROM issue_logs WHERE issue_id = ? ORDER BY datetime(created_at) DESC`,
      [id]
    );
    res.json(logs);
  } catch (e) {
    next(e);
  }
});

// GET /v1/issues/stats (conteo rápido)
router.get("/stats", async (req, res, next) => {
  try {
    const rows = await all(`SELECT status, COUNT(*) as count FROM issues GROUP BY status`);
    const stats = {
      open: 0,
      in_progress: 0,
      resolved: 0,
      total: 0
    };
    rows.forEach(r => {
      stats[r.status] = r.count;
      stats.total += r.count;
    });
    // Evitar caché
    res.setHeader("Cache-Control", "no-store");
    res.json(stats);
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

// GET /v1/issues/export (CSV)
router.get("/export", async (req, res, next) => {
  try {
    // Validamos query params (reutilizamos el esquema de GET, aunque ignoraremos page/pageSize)
    const query = validateSchema(getIssuesSchema, req.query);
    let { order } = query;

    // Legacy support logic
    const orderRaw = req.query.order ? String(req.query.order) : "";
    const sortLegacy = req.query.sort ? String(req.query.sort) : "";

    if (!orderRaw && sortLegacy) {
      order = sortLegacy.trim() === "oldest" ? "old" : "new";
    }
    if (!["new", "old", "cat", "status"].includes(order)) order = "new";

    const { sql: whereSql, params } = buildWhereClause(query);
    
    let orderSql = "ORDER BY datetime(created_at) DESC";
    if (order === "old") orderSql = "ORDER BY datetime(created_at) ASC";
    else if (order === "cat") orderSql = "ORDER BY lower(category) ASC, datetime(created_at) DESC";
    else if (order === "status") {
       orderSql = `ORDER BY CASE status
        WHEN 'open' THEN 0
        WHEN 'in_progress' THEN 1
        WHEN 'resolved' THEN 2
        ELSE 9
      END ASC, datetime(created_at) DESC`;
    }

    // Sin límite de paginación para exportar todo lo filtrado
    const items = await all(
      `
      SELECT id, title, category, description, lat, lng, status, created_at, photo_url, text_url
      FROM issues
      ${whereSql}
      ${orderSql}
      `,
      params
    );

    // Generar CSV
    const headers = ["ID", "Fecha", "Estado", "Categoría", "Título", "Descripción", "Latitud", "Longitud", "Foto URL", "Doc URL"];
    
    // Helper para escapar CSV (comillas dobles -> dobles comillas dobles, envolver en comillas si hay comas o saltos)
    const escapeCsv = (val) => {
      if (val === null || val === undefined) return "";
      const str = String(val);
      if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const csvRows = items.map(it => {
      return [
        it.id,
        it.created_at,
        it.status,
        it.category,
        it.title,
        it.description,
        it.lat,
        it.lng,
        it.photo_url || "",
        it.text_url || ""
      ].map(escapeCsv).join(",");
    });

    const csvContent = [headers.join(","), ...csvRows].join("\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="issues.csv"');
    res.send(csvContent);

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
    const body = validateSchema(createIssueSchema, req.body);
    const { title, category, description, lat, lng } = body;

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

    // Log creation
    await logChange(result.lastID, "create");

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
    const id = Number(req.params.id);
    // Validar cuerpo
    const body = validateSchema(updateIssueSchema, req.body || {});
    const { status, description, category } = body;

    if (!id || !Number.isInteger(id)) {
      return res.status(400).json({
        error: { code: "bad_request", message: "id inválido", requestId: req.id },
      });
    }

    // 1. Obtener estado actual para comparar archivos
    const currentIssue = await get(`SELECT * FROM issues WHERE id = ?`, [id]);
    if (!currentIssue) {
      return res.status(404).json({
        error: { code: "not_found", message: "Issue no encontrada", requestId: req.id },
      });
    }

    const updates = [];
    const params = [];
    const filesToDelete = []; // Lista de archivos viejos a borrar si el update es exitoso

    // Validar status si viene (ya validado por schema, solo añadir a query)
    if (status) {
      updates.push("status = ?");
      params.push(status);
    }

    // Validar description si viene
    if (description !== undefined && description !== null) {
      updates.push("description = ?");
      params.push(description);
    }

    // Validar category si viene
    if (category) {
      updates.push("category = ?");
      params.push(category);
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

      if (currentIssue.photo_url) filesToDelete.push(currentIssue.photo_url);

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

      if (currentIssue.text_url) filesToDelete.push(currentIssue.text_url);
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

      if (currentIssue.resolution_photo_url) filesToDelete.push(currentIssue.resolution_photo_url);

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

      if (currentIssue.resolution_text_url) filesToDelete.push(currentIssue.resolution_text_url);
    }

    if (updates.length === 0) {
       return res.status(400).json({
        error: { code: "bad_request", message: "No hay campos para actualizar", requestId: req.id },
      });
    }

    // Ejecutar UPDATE
    params.push(id);
    await run(`UPDATE issues SET ${updates.join(", ")} WHERE id = ?`, params);

    // Logging de cambios
    const logPromises = [];
    if (status && status !== currentIssue.status) {
      logPromises.push(logChange(id, "update_status", currentIssue.status, status));
    }
    if (description !== undefined && description !== currentIssue.description) {
      logPromises.push(logChange(id, "update_description", currentIssue.description, description));
    }
    if (category && category !== currentIssue.category) {
      logPromises.push(logChange(id, "update_category", currentIssue.category, category));
    }
    // Si se subieron archivos, registrar
    if (updates.some(u => u.startsWith("photo_url"))) {
      logPromises.push(logChange(id, "update_photo", currentIssue.photo_url, "new_photo"));
    }
    if (updates.some(u => u.startsWith("text_url"))) {
      logPromises.push(logChange(id, "update_doc", currentIssue.text_url, "new_doc"));
    }
    if (updates.some(u => u.startsWith("resolution_photo_url"))) {
      logPromises.push(logChange(id, "resolution_photo", currentIssue.resolution_photo_url, "new_resolution_photo"));
    }
    if (updates.some(u => u.startsWith("resolution_text_url"))) {
      logPromises.push(logChange(id, "resolution_doc", currentIssue.resolution_text_url, "new_resolution_doc"));
    }
    await Promise.all(logPromises);

    // Si todo salió bien, borramos los archivos viejos
    for (const url of filesToDelete) {
      deleteFileByUrl(url);
    }

    const updated = await get(
      `SELECT * FROM issues WHERE id = ?`,
      [id]
    );

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
    const id = Number(req.params.id);
    if (!id || !Number.isInteger(id)) {
      return res.status(400).json({
        error: { code: "bad_request", message: "id inválido", requestId: req.id },
      });
    }

    const row = await get(`SELECT photo_url, resolution_photo_url, text_url, resolution_text_url FROM issues WHERE id = ?`, [id]);
    await run(`DELETE FROM issues WHERE id = ?`, [id]);

    if (row) {
      // Borrar todos los archivos asociados
      [row.photo_url, row.resolution_photo_url, row.text_url, row.resolution_text_url].forEach(u => deleteFileByUrl(u));
    }

    res.setHeader("Cache-Control", "no-store");
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

module.exports = router;