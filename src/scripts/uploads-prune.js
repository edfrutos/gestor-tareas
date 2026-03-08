"use strict";

const fs = require("fs/promises");

const sqlite = require("../db/sqlite");
const { getUploadDir, getThumbsDir, isTestEnv, resolveSafe } = require("../config/paths");

// helpers db
const all =
  (typeof sqlite.all === "function" && sqlite.all.bind(sqlite)) ||
  (sqlite.db && typeof sqlite.db.all === "function" && sqlite.db.all.bind(sqlite.db));
const run =
  (typeof sqlite.run === "function" && sqlite.run.bind(sqlite)) ||
  (sqlite.db && typeof sqlite.db.run === "function" && sqlite.db.run.bind(sqlite.db));

if (!all || !run) {
  console.error("No encuentro all/run en ../db/sqlite exports:", Object.keys(sqlite));
  process.exit(1);
}

// Usar paths.js para consistencia; rechazar en NODE_ENV=test salvo PRUNE_FORCE=1
if (isTestEnv() && process.env.PRUNE_FORCE !== "1") {
  console.error("[uploads-prune] Rechazado: NODE_ENV=test. Usa PRUNE_FORCE=1 para tests.");
  process.exit(1);
}

const UPLOAD_DIR = getUploadDir();
const THUMBS_DIR = getThumbsDir();

// ⚠️ por defecto NO borra; solo borra si PRUNE=1
const PRUNE = process.env.PRUNE === "1";
const MAX_DELETE = Number(process.env.MAX_DELETE || 200);

function normalizeUploadPath(v) {
  if (!v) return null;
  const s = String(v).trim();
  if (!s) return null;
  // Acepta "/uploads/xxx" o "uploads/xxx" o "thumbs/xxx"
  if (s.startsWith("/uploads/")) return s;
  if (s.startsWith("uploads/")) return "/" + s;
  if (s.startsWith("/thumbs/")) return "/uploads" + s;
  if (s.startsWith("thumbs/")) return "/uploads/" + s;
  return s; // si es algo raro, lo dejamos tal cual
}

function fileNameFromUploadUrl(u) {
  // "/uploads/photo.jpg" => "photo.jpg"
  // "/uploads/thumbs/photo.jpg.webp" => "photo.jpg.webp"
  if (!u) return null;
  const s = normalizeUploadPath(u);
  if (!s) return null;
  if (!s.startsWith("/uploads/")) return null;
  return s.replace("/uploads/", "");
}

(async () => {
  const rows = await all("SELECT id, photo_url, thumb_url FROM issues ORDER BY id;");
  const referenced = new Set();

  for (const r of rows) {
    const p = fileNameFromUploadUrl(r.photo_url);
    const t = fileNameFromUploadUrl(r.thumb_url);
    if (p) referenced.add(p);
    if (t) referenced.add(t);
  }

  const files = (await fs.readdir(UPLOAD_DIR).catch(() => [])).filter((f) => f !== "thumbs");
  const thumbs = await fs.readdir(THUMBS_DIR).catch(() => []);

  const orphanFiles = files.filter((f) => !referenced.has(f));
  const orphanThumbs = thumbs.filter((f) => !referenced.has("thumbs/" + f) && !referenced.has(f));

  console.log("=== UPLOADS PRUNE ===");
  console.log("UPLOAD_DIR:", UPLOAD_DIR);
  console.log("PRUNE:", PRUNE ? "YES (deleting)" : "NO (dry-run)");
  console.log("db rows:", rows.length);
  console.log("uploads files:", files.length, "orphans:", orphanFiles.length);
  console.log("thumbs files:", thumbs.length, "orphans:", orphanThumbs.length);

  const toDelete = [];
  for (const f of orphanFiles) {
    const abs = resolveSafe(UPLOAD_DIR, f);
    if (abs) toDelete.push({ type: "upload", rel: f, abs });
  }
  for (const f of orphanThumbs) {
    const abs = resolveSafe(THUMBS_DIR, f);
    if (abs) toDelete.push({ type: "thumb", rel: "thumbs/" + f, abs });
  }

  if (!PRUNE) {
    console.log("\nSample orphans (first 30):");
    toDelete.slice(0, 30).forEach((x) => console.log("-", x.rel));
    return;
  }

  if (toDelete.length === 0) {
    console.log("Nothing to delete.");
    return;
  }

  let deleted = 0;
  for (const item of toDelete) {
    if (deleted >= MAX_DELETE) {
      console.log("MAX_DELETE reached:", MAX_DELETE);
      break;
    }
    try {
      await fs.unlink(item.abs);
      deleted++;
      console.log("deleted:", item.rel);
    } catch (e) {
      console.log("skip:", item.rel, "-", e?.message || String(e));
    }
  }

  console.log("\n✅ Done. Deleted:", deleted);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});