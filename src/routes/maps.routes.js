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
    const parentId = req.query.parent_id ? Number(req.query.parent_id) : null;
    const excludeLayers = req.query.exclude_layers === 'true';

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

    if (parentId !== null) {
      sql += ` AND m.parent_id = ?`;
      params.push(parentId);
    } else if (excludeLayers) {
      sql += ` AND m.parent_id IS NULL`;
    }

    sql += ` ORDER BY m.created_at DESC`;

    const items = await all(sql, params);
    res.json(items);
  } catch (e) {
    next(e);
  }
});

// PATCH /v1/maps/:id/archive - Archivar o restaurar plano
router.patch("/:id/archive", requireAuth(), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { archived } = req.body;
    if (typeof archived !== "boolean") {
      return res.status(400).json({ error: "Se requiere 'archived' (boolean)" });
    }

    const map = await get("SELECT * FROM maps WHERE id = ?", [id]);
    if (!map) return res.status(404).json({ error: "Mapa no encontrado" });

    if (req.user.role !== "admin" && map.created_by !== req.user.id) {
      return res.status(403).json({ error: "No tienes permiso" });
    }

    await run("UPDATE maps SET archived = ? WHERE id = ?", [archived ? 1 : 0, id]);
    const updated = await get("SELECT * FROM maps WHERE id = ?", [id]);
    res.json(updated);
  } catch (e) {
    next(e);
  }
});

// DELETE /v1/maps/:id
router.delete("/:id", requireAuth(), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const map = await get("SELECT * FROM maps WHERE id = ?", [id]);
    if (!map) return res.status(404).json({ error: "Mapa no encontrado" });

    if (req.user.role !== "admin" && map.created_by !== req.user.id) {
      return res.status(403).json({ error: "No tienes permiso" });
    }

    if (id === 1) {
      return res.status(400).json({ error: "No se puede eliminar el plano principal del sistema" });
    }

    const childMaps = await all("SELECT id, file_url, thumb_url FROM maps WHERE parent_id = ?", [id]);
    const childIds = childMaps.map(c => c.id);
    await run("UPDATE issues SET map_id = NULL WHERE map_id = ?", [id]);
    for (const cid of childIds) {
      await run("UPDATE issues SET map_id = NULL WHERE map_id = ?", [cid]);
      await run("DELETE FROM map_zones WHERE map_id = ?", [cid]);
    }
    await run("DELETE FROM map_zones WHERE map_id = ?", [id]);
    await run("DELETE FROM maps WHERE parent_id = ?", [id]);
    await run("DELETE FROM maps WHERE id = ?", [id]);

    const toDelete = [map, ...childMaps];
    for (const m of toDelete) {
      if (m.file_url && m.file_url.startsWith("/uploads/")) {
        const filename = path.basename(m.file_url);
        const filePath = path.join(uploadDir, filename);
        try {
          if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        } catch (err) {
          console.error("Error deleting map file:", err);
        }
        if (m.thumb_url) {
          const thumbPath = path.join(thumbsDir, path.basename(m.thumb_url));
          try {
            if (fs.existsSync(thumbPath)) fs.unlinkSync(thumbPath);
          } catch (err) {
            console.error("Error deleting map thumb:", err);
          }
        }
      }
    }

    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// POST /v1/maps
router.post("/", requireAuth(), upload.single("map"), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Se requiere una imagen" });
    
    const name = req.body.name || "Nuevo Plano";
    const parentId = req.body.parent_id ? Number(req.body.parent_id) : null;
    const userId = req.user.id;
    const fileUrl = `/uploads/${req.file.filename}`;
    
    // Generar thumbnail
    const thumbUrl = await makeMapThumb(req.file.filename);

    const result = await run(
      `INSERT INTO maps (name, file_url, thumb_url, parent_id, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
      [name, fileUrl, thumbUrl, parentId, userId, new Date().toISOString()]
    );

    const newItem = await get(`SELECT * FROM maps WHERE id = ?`, [result.lastID]);
    res.status(201).json(newItem);
  } catch (e) {
    next(e);
  }
});

// ... (DELETE route)

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

    // Incluir capas si existen
    const layers = await all("SELECT * FROM maps WHERE parent_id = ? AND archived = 0", [id]);
    map.layers = layers;

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
    const map = await get("SELECT * FROM maps WHERE id = ?", [mapId]);
    if (!map) return res.status(404).json({ error: "Mapa no encontrado" });

    // RBAC (misma lógica que GET /v1/maps/:id)
    if (req.user.role !== 'admin' && map.created_by !== req.user.id && map.created_by !== 1) {
      return res.status(403).json({ error: "No tienes permiso" });
    }

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

    const map = await get("SELECT * FROM maps WHERE id = ?", [mapId]);
    if (!map) return res.status(404).json({ error: "Mapa no encontrado" });

    if (req.user.role !== 'admin' && map.created_by !== req.user.id) {
      return res.status(403).json({ error: "No tienes permiso" });
    }

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
    const mapId = Number(req.params.mapId);

    const zone = await get("SELECT * FROM map_zones WHERE id = ?", [id]);
    if (!zone) return res.status(404).json({ error: "Zona no encontrada" });
    if (zone.map_id !== mapId) return res.status(404).json({ error: "Zona no encontrada" });

    const body = zoneSchema.partial().parse(req.body);

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
    const mapId = Number(req.params.mapId);
    const zone = await get("SELECT * FROM map_zones WHERE id = ?", [id]);
    if (!zone) return res.status(404).json({ error: "Zona no encontrada" });
    if (mapId !== zone.map_id) return res.status(404).json({ error: "Zona no encontrada" });

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
