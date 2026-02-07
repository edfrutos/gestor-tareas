"use strict";

const fs = require("fs/promises");
const path = require("path");

const sqlite = require("../db/sqlite");

// Bind helpers (compatibles con tus exports actuales)
const all =
  (typeof sqlite.all === "function" && sqlite.all.bind(sqlite)) ||
  (sqlite.db && typeof sqlite.db.all === "function" && sqlite.db.all.bind(sqlite.db));

const run =
  (typeof sqlite.run === "function" && sqlite.run.bind(sqlite)) ||
  (sqlite.db && typeof sqlite.db.run === "function" && sqlite.db.run.bind(sqlite.db));

if (!all) throw new Error("No encuentro sqlite.all en ../db/sqlite");
if (!run) throw new Error("No encuentro sqlite.run en ../db/sqlite");

const UPLOAD_DIR = process.env.UPLOAD_DIR || "/app/uploads";
const DRY_RUN = process.env.DRY_RUN !== "0"; // por defecto: DRY_RUN=1

function normUploadUrl(v) {
  if (v === null || v === undefined) return null;

  let s = String(v).trim();
  if (!s) return null;

  // URLs remotas: no tocamos
  if (s.startsWith("http://") || s.startsWith("https://")) return s;

  // normaliza prefijo
  if (s.startsWith("/uploads/")) return s;
  if (s.startsWith("uploads/")) return "/" + s;

  // quita slashes iniciales y prefija /uploads/
  while (s.startsWith("/")) s = s.slice(1);
  return "/uploads/" + s;
}

function stripUploadsPrefix(u) {
  if (!u) return null;
  return u.startsWith("/uploads/") ? u.slice("/uploads/".length) : u;
}

function fsPathFromUploadsUrl(u) {
  if (!u) return null;
  if (u.startsWith("http://") || u.startsWith("https://")) return null;
  const rel = stripUploadsPrefix(u);
  return path.join(UPLOAD_DIR, rel);
}

function derivedThumbUrl(photoUrl) {
  if (!photoUrl) return null;
  if (photoUrl.startsWith("http://") || photoUrl.startsWith("https://")) return null;

  const rel = stripUploadsPrefix(photoUrl);
  // thumb convention: /uploads/thumbs/<original> + ".webp"
  return "/uploads/thumbs/" + rel + ".webp";
}

async function exists(p) {
  if (!p) return false;
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

(async () => {
  const rows = await all("SELECT id, photo_url, thumb_url FROM issues ORDER BY id;");

  let updated = 0;
  let normalized = 0;
  let fixedThumb = 0;
  let nulledBadThumb = 0;
  let nulledBadPhoto = 0;

  const planned = [];

  for (const r of rows) {
    const photoNorm = normUploadUrl(r.photo_url);
    const thumbNorm = normUploadUrl(r.thumb_url);

    // si no hay foto -> no debe haber thumb
    if (!photoNorm) {
      const newPhoto = null;
      const newThumb = null;
      const needs =
        (r.photo_url || null) !== newPhoto || (r.thumb_url || null) !== newThumb;

      if (needs) {
        planned.push({ id: r.id, photo_url: r.photo_url, thumb_url: r.thumb_url, newPhoto, newThumb, reason: "no photo -> no thumb" });
      }
      continue;
    }

    // si es URL remota: normaliza solo (si procede), y no forzamos thumb derivada
    if (photoNorm.startsWith("http://") || photoNorm.startsWith("https://")) {
      const newPhoto = photoNorm;
      const newThumb = thumbNorm; // dejamos lo que haya
      const needs =
        (r.photo_url || null) !== newPhoto || (r.thumb_url || null) !== (newThumb || null);

      if (needs) {
        planned.push({ id: r.id, photo_url: r.photo_url, thumb_url: r.thumb_url, newPhoto, newThumb, reason: "remote photo -> normalize only" });
      }
      continue;
    }

    const photoPath = fsPathFromUploadsUrl(photoNorm);
    const photoOk = await exists(photoPath);

    // si foto apunta a algo que no existe => ponemos null (consistencia)
    if (!photoOk) {
      const newPhoto = null;
      const newThumb = null;
      planned.push({ id: r.id, photo_url: r.photo_url, thumb_url: r.thumb_url, newPhoto, newThumb, reason: "photo missing -> null both" });
      continue;
    }

    // foto ok: intentamos asegurar thumb derivada si existe
    const wantThumb = derivedThumbUrl(photoNorm);
    const wantThumbPath = fsPathFromUploadsUrl(wantThumb);
    const wantThumbOk = await exists(wantThumbPath);

    let finalThumb = thumbNorm;

    if (wantThumbOk) {
      // si existe la derivada, la preferimos
      finalThumb = wantThumb;
    } else {
      // si NO existe derivada: si hay thumb_url pero no existe -> null
      if (thumbNorm) {
        const curThumbPath = fsPathFromUploadsUrl(thumbNorm);
        const curThumbOk = await exists(curThumbPath);
        if (!curThumbOk) finalThumb = null;
      }
    }

    const newPhoto = photoNorm;
    const newThumb = finalThumb || null;

    const needs =
      (r.photo_url || null) !== (newPhoto || null) ||
      (r.thumb_url || null) !== (newThumb || null);

    if (needs) {
      planned.push({
        id: r.id,
        photo_url: r.photo_url,
        thumb_url: r.thumb_url,
        newPhoto,
        newThumb,
        reason: wantThumbOk ? "set derived thumb" : "normalize / drop bad thumb",
      });
    }
  }

  console.log("=== DB REPAIR PLAN ===");
  console.log("UPLOAD_DIR:", UPLOAD_DIR);
  console.log("rows:", rows.length);
  console.log("changes:", planned.length);
  console.log("DRY_RUN:", DRY_RUN ? "1" : "0");
  console.log("");

  planned.slice(0, 50).forEach((p) => console.log(p));
  if (planned.length > 50) console.log(`... (${planned.length - 50} more)`);

  if (DRY_RUN) {
    console.log("\n✅ DRY_RUN=1, no se ha modificado nada.");
    process.exit(0);
  }

  // Apply changes in a TX
  await run("BEGIN");
  try {
    for (const p of planned) {
      await run("UPDATE issues SET photo_url = ?, thumb_url = ? WHERE id = ?", [
        p.newPhoto,
        p.newThumb,
        p.id,
      ]);

      updated++;

      if ((p.photo_url || null) !== (p.newPhoto || null)) normalized++;
      if ((p.thumb_url || null) !== (p.newThumb || null)) {
        if (p.newThumb && p.reason.includes("derived")) fixedThumb++;
        if (!p.newThumb && p.thumb_url) nulledBadThumb++;
      }
      if (!p.newPhoto && p.photo_url) nulledBadPhoto++;
    }

    await run("COMMIT");
  } catch (e) {
    await run("ROLLBACK");
    throw e;
  }

  console.log("\n✅ DB repair applied");
  console.log({ rows: rows.length, changes: planned.length, updated, normalized, fixedThumb, nulledBadThumb, nulledBadPhoto });
})().catch((e) => {
  console.error(e);
  process.exit(1);
});