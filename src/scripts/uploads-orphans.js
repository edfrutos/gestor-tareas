"use strict";

const fs = require("fs/promises");
const path = require("path");

const sqlite = require("../db/sqlite");

const all =
  (typeof sqlite.all === "function" && sqlite.all.bind(sqlite)) ||
  (sqlite.db && typeof sqlite.db.all === "function" && sqlite.db.all.bind(sqlite.db));

if (!all) throw new Error("No encuentro sqlite.all en ../db/sqlite");

const UPLOAD_DIR = process.env.UPLOAD_DIR || "/app/uploads";

function pickNameFromUploadsUrl(u) {
  if (!u) return null;
  if (u.startsWith("http://") || u.startsWith("https://")) return null;

  // /uploads/xxxx o /uploads/thumbs/xxxx
  const idx = u.indexOf("/uploads/");
  if (idx >= 0) {
    const rel = u.slice(idx + "/uploads/".length);
    // rel puede ser: "file.jpg" o "thumbs/file.jpg.webp"
    return rel;
  }

  return null;
}

(async () => {
  const rows = await all("SELECT id, photo_url, thumb_url FROM issues;");

  const hits = new Set();
  for (const r of rows) {
    const p = pickNameFromUploadsUrl(r.photo_url);
    const t = pickNameFromUploadsUrl(r.thumb_url);
    if (p) hits.add(p);
    if (t) hits.add(t);
  }

  const uploads = await fs.readdir(UPLOAD_DIR).catch(() => []);
  const thumbsDir = path.join(UPLOAD_DIR, "thumbs");
  const thumbs = await fs.readdir(thumbsDir).catch(() => []);

  // archivos en uploads raíz (sin la carpeta thumbs)
  const files = uploads.filter((x) => x !== "thumbs");

  function referencedUploadRoot(name) {
    // Comparar contra: "file.jpg" y posibles variantes con prefijo
    return hits.has(name) || hits.has("thumbs/" + name) || hits.has("/" + name);
  }

  function referencedThumb(name) {
    // name aquí es el nombre dentro de thumbs/
    return (
      hits.has("thumbs/" + name) ||
      hits.has(name) ||
      hits.has("/thumbs/" + name)
    );
  }

  const orphanFiles = files.filter((f) => !referencedUploadRoot(f));
  const orphanThumbs = thumbs.filter((f) => !referencedThumb(f));

  console.log("=== UPLOADS ORPHANS (not deleting) ===");
  console.log("UPLOAD_DIR:", UPLOAD_DIR);
  console.log("db rows:", rows.length);
  console.log("uploads files:", files.length, "orphans:", orphanFiles.length);
  console.log("thumbs files:", thumbs.length, "orphans:", orphanThumbs.length);

  console.log("\nSample orphan uploads (first 30):");
  orphanFiles.slice(0, 30).forEach((f) => console.log("-", f));

  console.log("\nSample orphan thumbs (first 30):");
  orphanThumbs.slice(0, 30).forEach((f) => console.log("-", f));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});