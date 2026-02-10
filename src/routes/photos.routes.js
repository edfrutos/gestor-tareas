// src/routes/photos.routes.js
const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const multer = require("multer");

const requireAuth = require("../middleware/auth.middleware");
const { getUploadDir } = require("../config/paths");

const router = express.Router();

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

const uploadDir = getUploadDir();
ensureDir(uploadDir);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase() || ".bin";
    const id = crypto.randomBytes(6).toString("hex");
    cb(null, `photo_${Date.now()}_${id}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: Number(process.env.MAX_UPLOAD_BYTES || 8 * 1024 * 1024),
  },
  fileFilter: (_req, file, cb) => {
    const ok =
      file.mimetype === "image/jpeg" ||
      file.mimetype === "image/png" ||
      file.mimetype === "image/webp" ||
      file.mimetype === "image/gif";
    cb(ok ? null : new Error("unsupported_file_type"), ok);
  },
});

// POST /v1/photos (multipart campo "file")
router.post("/", requireAuth(), upload.single("file"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      error: { code: "bad_request", message: "Falta el archivo (campo form-data: file)" },
    });
  }
  const url = `/uploads/${req.file.filename}`;
  res.status(201).json({
    ok: true,
    url,
    filename: req.file.filename,
    size: req.file.size,
    mimetype: req.file.mimetype,
  });
});

module.exports = router;