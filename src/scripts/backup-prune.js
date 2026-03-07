"use strict";

/**
 * Purga de backups antiguos (reproducible y auditable).
 * Uso: node src/scripts/backup-prune.js
 *   - Por defecto: dry-run, lista qué se borraría
 *   - PRUNE=1: ejecuta borrado
 *   - RETENTION_DAYS=N: días a conservar (default 7)
 *
 * NODE_ENV=test: rechazado (no purgar backups de producción).
 */

const fs = require("fs");
const path = require("path");
const { getBackupDir, isTestEnv } = require("../config/paths");

const PRUNE = process.env.PRUNE === "1";
const RETENTION_DAYS = Number(process.env.RETENTION_DAYS || process.env.BACKUP_RETENTION_DAYS || 7);

function log(...args) {
  console.log("[backup-prune]", ...args);
}

function run() {
  console.log("=== BACKUP PRUNE ===");
  log("PRUNE:", PRUNE ? "YES" : "NO (dry-run)");
  log("RETENTION_DAYS:", RETENTION_DAYS);

  if (isTestEnv()) {
    log("Rechazado: NODE_ENV=test.");
    process.exit(1);
  }

  const backupDir = getBackupDir();
  if (!backupDir || !fs.existsSync(backupDir)) {
    log("No hay directorio de backups.");
    return;
  }

  const files = fs
    .readdirSync(backupDir)
    .filter((f) => fs.statSync(path.join(backupDir, f)).isFile());
  const toDelete = [];

  if (RETENTION_DAYS <= 1) {
    // Mantener solo el backup más reciente (par db + uploads con mismo timestamp)
    const byMtime = files
      .map((f) => ({ name: f, mtime: fs.statSync(path.join(backupDir, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
    const keepBase = byMtime[0]?.name.replace(/^(db|uploads)-|\.(sqlite|tar\.gz)$/g, "") || "";
    for (const f of files) {
      const base = f.replace(/^(db|uploads)-|\.(sqlite|tar\.gz)$/g, "");
      if (base !== keepBase) toDelete.push({ name: f, mtime: new Date(fs.statSync(path.join(backupDir, f)).mtimeMs) });
    }
  } else {
    const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
    for (const f of files) {
      const full = path.join(backupDir, f);
      const stat = fs.statSync(full);
      if (stat.mtimeMs < cutoff) toDelete.push({ name: f, mtime: stat.mtime });
    }
  }

  if (toDelete.length === 0) {
    log("Nada que purgar.");
    return;
  }

  log("Archivos a purgar:", toDelete.length);
  toDelete.forEach((x) => log(" -", x.name, x.mtime.toISOString()));

  if (!PRUNE) {
    log("Dry-run. Para purgar: PRUNE=1");
    return;
  }

  let deleted = 0;
  for (const x of toDelete) {
    try {
      fs.unlinkSync(path.join(backupDir, x.name));
      deleted++;
      log("deleted:", x.name);
    } catch (e) {
      log("skip:", x.name, "-", e?.message);
    }
  }
  log("✅ Purged:", deleted);
}

run();
