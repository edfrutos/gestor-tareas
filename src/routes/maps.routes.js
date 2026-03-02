const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const multer = require("multer");
const sharp = require("sharp");
const { z } = require("zod");

const { run, all, get } = require("../db/sqlite");
const requireAuth = require("../middleware/auth.middleware");
const { getUploadDir, getThumbsDir } = require("../config/paths");

const router = express.Router();

// Configuración de subida
const uploadDir = getUploadDir();
const thumbsDir = getThumbsDir();

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase() || ".jpg";
    const id = crypto.randomBytes(6).toString("hex");
    cb(null, `map_${Date.now()}_${id}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowedMimes = ["image/jpeg", "image/png", "image/webp"];
    if (allowedMimes.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Solo se permiten imágenes (JPG, PNG, WEBP)"), false);
  },
});

async function makeMapThumb(filename) {
  const srcPath = path.join(uploadDir, filename);
  const dstPath = path.join(thumbsDir, `${filename}.webp`);
  
  try {
    await sharp(srcPath)
      .resize(300, 200, { fit: "cover" }) // Thumb rectangular para selectores
      .webp({ quality: 80 })
      .toFile(dstPath);
    return `/uploads/thumbs/${filename}.webp`;
  } catch (err) {
    console.error("Error generating map thumb:", err);
    return null;
  }
}

// GET /v1/maps
router.get("/", requireAuth(), async (req, res, next) => {
  try {
    const userId = req.user.id;
    const isAdmin = req.user.role === 'admin';
    const includeArchived = req.query.include_archived === 'true';

    let sql = `
      SELECT m.*, u.username as created_by_username 
      FROM maps m
      LEFT JOIN users u ON m.created_by = u.id
      WHERE 1=1
    `;
    const params = [];

    if (!isAdmin) {
      // Usuarios ven los suyos O los creados por el admin por defecto (ID 1)
      sql += ` AND (m.created_by = ? OR m.created_by = 1)`;
      params.push(userId);
    }

    if (!includeArchived) {
      sql += ` AND m.archived = 0`;
    }

    sql += ` ORDER BY m.created_at DESC`;

    const items = await all(sql, params);
    res.json(items);
  } catch (e) {
    next(e);
  }
});

// PATCH /v1/maps/:id/archive
router.patch("/:id/archive", requireAuth(), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { archived } = req.body;

    if (id === 1 && archived) {
      return res.status(400).json({ error: "No se puede archivar el mapa principal" });
    }

    const map = await get("SELECT * FROM maps WHERE id = ?", [id]);
    if (!map) return res.status(404).json({ error: "Mapa no encontrado" });

    // RBAC: Solo admin o dueño
    if (req.user.role !== 'admin' && map.created_by !== req.user.id) {
      return res.status(403).json({ error: "No tienes permiso" });
    }

    await run("UPDATE maps SET archived = ? WHERE id = ?", [archived ? 1 : 0, id]);
    res.json({ ok: true, archived: !!archived });
  } catch (e) {
    next(e);
  }
});

// POST /v1/maps
router.post("/", requireAuth(), upload.single("map"), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Se requiere una imagen" });
    
    const name = req.body.name || "Nuevo Plano";
    const userId = req.user.id;
    const fileUrl = `/uploads/${req.file.filename}`;
    
    // Generar thumbnail
    const thumbUrl = await makeMapThumb(req.file.filename);

    const result = await run(
      `INSERT INTO maps (name, file_url, thumb_url, created_by, created_at) VALUES (?, ?, ?, ?, ?)`,
      [name, fileUrl, thumbUrl, userId, new Date().toISOString()]
    );

    const newItem = await get(`SELECT * FROM maps WHERE id = ?`, [result.lastID]);
    res.status(201).json(newItem);
  } catch (e) {
    next(e);
  }
});

// DELETE /v1/maps/:id
router.delete("/:id", requireAuth(), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (id === 1) return res.status(400).json({ error: "No se puede borrar el mapa principal" });

    const map = await get("SELECT * FROM maps WHERE id = ?", [id]);
    if (!map) return res.status(404).json({ error: "Mapa no encontrado" });

    // RBAC
    if (req.user.role !== 'admin' && map.created_by !== req.user.id) {
      return res.status(403).json({ error: "No tienes permiso" });
    }

    // Verificar si está en uso
    const used = await get("SELECT COUNT(*) as count FROM issues WHERE map_id = ?", [id]);
    if (used.count > 0) {
      return res.status(400).json({ error: "No se puede borrar un mapa con incidencias asociadas" });
    }

    await run("DELETE FROM maps WHERE id = ?", [id]);

    // Borrar archivos
    try {
      const filename = map.file_url.replace("/uploads/", "");
      fs.unlinkSync(path.join(uploadDir, filename));
      if (map.thumb_url) {
        const thumbName = map.thumb_url.replace("/uploads/thumbs/", "");
        fs.unlinkSync(path.join(thumbsDir, thumbName));
      }
    } catch(e) { console.error("Error borrando ficheros mapa:", e); }

    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// GET /v1/maps/:id
router.get("/:id", requireAuth(), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const map = await get("SELECT * FROM maps WHERE id = ?", [id]);
    if (!map) return res.status(404).json({ error: "Mapa no encontrado" });

    // RBAC
    if (req.user.role !== 'admin' && map.created_by !== req.user.id && map.created_by !== 1) {
      return res.status(403).json({ error: "No tienes permiso" });
    }

    res.json(map);
  } catch (e) {
    next(e);
  }
});

// --- MAP ZONES ---

const zoneSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.string().min(1),
  geojson: z.string().min(1),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default("#3388ff"),
});

// GET /v1/maps/:mapId/zones
router.get("/:mapId/zones", requireAuth(), async (req, res, next) => {
  try {
    const mapId = Number(req.params.mapId);
    const zones = await all("SELECT * FROM map_zones WHERE map_id = ? ORDER BY created_at ASC", [mapId]);
    res.json(zones);
  } catch (e) {
    next(e);
  }
});

// POST /v1/maps/:mapId/zones
router.post("/:mapId/zones", requireAuth(), async (req, res, next) => {
  try {
    const mapId = Number(req.params.mapId);
    const body = zoneSchema.parse(req.body);
    const userId = req.user.id;

    const result = await run(
      `INSERT INTO map_zones (map_id, name, type, geojson, color, created_by, created_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [mapId, body.name, body.type, body.geojson, body.color, userId, new Date().toISOString()]
    );

    const newItem = await get("SELECT * FROM map_zones WHERE id = ?", [result.lastID]);
    res.status(201).json(newItem);
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors });
    next(e);
  }
});

// PATCH /v1/maps/:mapId/zones/:id
router.patch("/:mapId/zones/:id", requireAuth(), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const body = zoneSchema.partial().parse(req.body);

    const zone = await get("SELECT * FROM map_zones WHERE id = ?", [id]);
    if (!zone) return res.status(404).json({ error: "Zona no encontrada" });

    // RBAC: Solo admin o dueño
    if (req.user.role !== 'admin' && zone.created_by !== req.user.id) {
      return res.status(403).json({ error: "No tienes permiso" });
    }

    const updates = [];
    const params = [];
    Object.keys(body).forEach(key => {
      updates.push(`${key} = ?`);
      params.push(body[key]);
    });
    params.push(id);

    await run(`UPDATE map_zones SET ${updates.join(", ")} WHERE id = ?`, params);
    const updatedItem = await get("SELECT * FROM map_zones WHERE id = ?", [id]);
    res.json(updatedItem);
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors });
    next(e);
  }
});

// DELETE /v1/maps/:mapId/zones/:id
router.delete("/:mapId/zones/:id", requireAuth(), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const zone = await get("SELECT * FROM map_zones WHERE id = ?", [id]);
    if (!zone) return res.status(404).json({ error: "Zona no encontrada" });

    // RBAC
    if (req.user.role !== 'admin' && zone.created_by !== req.user.id) {
      return res.status(403).json({ error: "No tienes permiso" });
    }

    await run("DELETE FROM map_zones WHERE id = ?", [id]);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
