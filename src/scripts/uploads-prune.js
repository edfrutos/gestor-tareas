"use strict";

const fs = require("fs/promises");
const path = require("path");

const sqlite = require("../db/sqlite");

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

const UPLOAD_DIR = process.env.UPLOAD_DIR || "/app/uploads";
const THUMBS_DIR = path.join(UPLOAD_DIR, "thumbs");

// ⚠️ por defecto NO borra; solo borra si PRUNE=1
const PRUNE = process.env.PRUNE === "1";
const MAX_DELETE = Number(process.env.MAX_DELETE || 200);

function isSafePath(baseDir, maybeRelativePath) {
  const base = path.resolve(baseDir);
  const resolved = path.resolve(baseDir, maybeRelativePath);
  return resolved === base || resolved.startsWith(base + path.sep);
}

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
  for (const f of orphanFiles) toDelete.push({ type: "upload", rel: f, abs: path.join(UPLOAD_DIR, f) });
  for (const f of orphanThumbs) toDelete.push({ type: "thumb", rel: "thumbs/" + f, abs: path.join(THUMBS_DIR, f) });

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
      // Defensa en profundidad: evita traversal (p.ej. "../../../etc/passwd")
      // que podría escaparse de UPLOAD_DIR al resolver la ruta final.
      if (!isSafePath(UPLOAD_DIR, item.rel)) {
        console.warn(
          "unsafe path (skipping):",
          item.rel,
          "=>",
          path.resolve(UPLOAD_DIR, item.rel),
          "(base:",
          path.resolve(UPLOAD_DIR) + ")"
        );
        continue;
      }

      const safeAbs = path.resolve(UPLOAD_DIR, item.rel);
      await fs.unlink(safeAbs);
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