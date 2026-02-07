"use strict";

const fs = require("fs/promises");
const path = require("path");

const sqlite = require("../db/sqlite");

const all =
  (typeof sqlite.all === "function" && sqlite.all.bind(sqlite)) ||
  (sqlite.db && typeof sqlite.db.all === "function" && sqlite.db.all.bind(sqlite.db));

if (!all) throw new Error("No encuentro sqlite.all en ../db/sqlite");

const UPLOAD_DIR = process.env.UPLOAD_DIR || "/app/uploads";

function isRemote(u) {
  if (!u) return false;
  return u.startsWith("http://") || u.startsWith("https://");
}

function normUploadsUrl(v) {
  if (v === null || v === undefined) return null;
  let s = String(v).trim();
  if (!s) return null;

  if (isRemote(s)) return s;

  if (s.startsWith("/uploads/")) return s;
  if (s.startsWith("uploads/")) return "/" + s;

  while (s.startsWith("/")) s = s.slice(1);
  return "/uploads/" + s;
}

function stripUploadsPrefix(u) {
  if (!u) return null;
  return u.startsWith("/uploads/") ? u.slice("/uploads/".length) : u;
}

function fsPathFromUploadsUrl(u) {
  if (!u) return null;
  if (isRemote(u)) return null;
  const rel = stripUploadsPrefix(u);
  return path.join(UPLOAD_DIR, rel);
}

function derivedThumbUrlFromPhoto(photoUrl) {
  if (!photoUrl) return null;
  if (isRemote(photoUrl)) return null;
  const rel = stripUploadsPrefix(photoUrl);
  return "/uploads/thumbs/" + rel + ".webp";
}

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

(async () => {
  const rows = await all("SELECT id, photo_url, thumb_url FROM issues ORDER BY id;");

  let missingPhoto = 0;
  let missingThumb = 0;
  let thumbNullButDerivedExists = 0;

  const examples = [];

  for (const r of rows) {
    const photoNorm = normUploadsUrl(r.photo_url);
    const thumbNorm = normUploadsUrl(r.thumb_url);

    // foto
    let photoOk = true;
    if (photoNorm && !isRemote(photoNorm)) {
      photoOk = await exists(fsPathFromUploadsUrl(photoNorm));
      if (!photoOk) missingPhoto++;
    }

    // thumb
    let thumbOk = true;
    if (thumbNorm && !isRemote(thumbNorm)) {
      thumbOk = await exists(fsPathFromUploadsUrl(thumbNorm));
      if (!thumbOk) missingThumb++;
    }

    // derivado
    const derivedThumb = derivedThumbUrlFromPhoto(photoNorm);
    let derivedOk = false;
    if (derivedThumb) derivedOk = await exists(fsPathFromUploadsUrl(derivedThumb));

    if (!thumbNorm && derivedOk) thumbNullButDerivedExists++;

    if (
      examples.length < 30 &&
      ((photoNorm && !photoOk) || (thumbNorm && !thumbOk) || (!thumbNorm && derivedOk))
    ) {
      examples.push({
        id: r.id,
        photo_url: r.photo_url,
        photo_norm: photoNorm,
        photo_exists: photoOk,
        thumb_url: r.thumb_url,
        thumb_norm: thumbNorm,
        thumb_exists: thumbOk,
        derived_thumb: derivedThumb,
        derived_thumb_exists: derivedOk,
      });
    }
  }

  console.log("=== DB AUDIT issues ===");
  console.log("UPLOAD_DIR:", UPLOAD_DIR);
  console.log("rows:", rows.length);
  console.log("missingPhoto:", missingPhoto);
  console.log("missingThumb:", missingThumb);
  console.log("thumbNullButDerivedExists:", thumbNullButDerivedExists);

  console.log("\n=== Examples (max 30) ===");
  examples.forEach((e) => console.log(e));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});