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

    let sql = `
      SELECT m.*, u.username as created_by_username 
      FROM maps m
      LEFT JOIN users u ON m.created_by = u.id
    `;
    const params = [];

    if (!isAdmin) {
      // Usuarios ven los suyos O los creados por admins (considerados públicos/sistema)
      // Asumimos que los mapas creados por usuarios con rol 'admin' son globales.
      // Ojo: Esto requiere hacer un JOIN con users para chequear el rol del creador, 
      // o simplificamos: el Admin (ID 1) es el sistema.
      // Vamos a permitir ver los propios Y los del ID 1 (default admin).
      sql += ` WHERE m.created_by = ? OR m.created_by = 1`;
      params.push(userId);
    }

    sql += ` ORDER BY m.created_at DESC`;

    const items = await all(sql, params);
    res.json(items);
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

module.exports = router;
