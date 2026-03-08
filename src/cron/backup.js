"use strict";

const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");
const { getDbFile, getUploadDir, getBackupDir, isTestEnv } = require("../config/paths");
const { openDb } = require("../db/sqlite");

// Retención: días a conservar (full backups). Por defecto 7.
const RETENTION_DAYS = Number(process.env.BACKUP_RETENTION_DAYS || 7);
const INTERVAL_MS = Number(process.env.BACKUP_INTERVAL_MS || 24 * 60 * 60 * 1000);

/**
 * Backup de BD usando SQLite Backup API (hot-backup seguro).
 * Fallback a fs.copyFile si la API no está disponible.
 */
function backupDbToFile(dbFile, destPath, cb) {
  openDb()
    .then((db) => {
      if (typeof db.backup !== "function") {
        fs.copyFile(dbFile, destPath, cb);
        return;
      }
      const backup = db.backup(destPath);
      backup.step(-1, (err) => {
        backup.finish((finErr) => {
          if (err || finErr) cb(err || finErr);
          else cb(null);
        });
      });
    })
    .catch((err) => cb(err));
}

function runBackup() {
  const backupDir = getBackupDir();
  if (!backupDir) {
    console.warn("[Backup] Deshabilitado en NODE_ENV=test (nunca respaldar BD de tests)");
    return;
  }

  const dbFile = getDbFile();
  if (path.basename(dbFile) === "test.db") {
    console.warn("[Backup] Rechazado: DB apunta a test.db. Verifica NODE_ENV y DB_FILE.");
    return;
  }

  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

  const now = new Date().toISOString().replace(/[:.]/g, "-");
  const uploadsDir = getUploadDir();
  const dbBackup = path.join(backupDir, `db-${now}.sqlite`);
  const uploadsBackup = path.join(backupDir, `uploads-${now}.tar.gz`);

  const parentDir = path.dirname(uploadsDir);
  const uploadsBasename = path.basename(uploadsDir);
  const cmd = `tar -czf "${uploadsBackup}" -C "${parentDir}" "${uploadsBasename}"`;
  exec(cmd, (err) => {
    if (err) console.error(`[Backup] Uploads Failed: ${err.message}`);
    else console.log(`[Backup] Uploads Saved: ${uploadsBackup}`);
  });

  return new Promise((resolve) => {
    backupDbToFile(dbFile, dbBackup, (err) => {
      if (err) {
        console.error(`[Backup] DB Failed: ${err.message}`);
        // Fallback a copia directa si Backup API falla (ej. DB corrupta)
        try {
          fs.copyFileSync(dbFile, dbBackup);
          console.log(`[Backup] DB Saved (fallback copy): ${dbBackup}`);
        } catch (copyErr) {
          console.error(`[Backup] Fallback copy also failed: ${copyErr.message}`);
        }
      } else {
        console.log(`[Backup] DB Saved: ${dbBackup}`);
      }
      pruneOldBackups(backupDir);
      resolve();
    });
  });
}

function pruneOldBackups(backupDir) {
  try {
    const files = fs.readdirSync(backupDir).filter((f) => {
      const full = path.join(backupDir, f);
      return fs.statSync(full).isFile();
    });
    if (files.length === 0) return;

    const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
    let pruned = 0;

    if (RETENTION_DAYS <= 1) {
      // Mantener solo el backup más reciente (par db + uploads con mismo timestamp)
      const byMtime = files
        .map((f) => ({ name: f, mtime: fs.statSync(path.join(backupDir, f)).mtimeMs }))
        .sort((a, b) => b.mtime - a.mtime);
      const keepBase = byMtime[0]?.name.replace(/^(db|uploads)-|\.(sqlite|tar\.gz)$/g, "") || "";
      for (const f of files) {
        const base = f.replace(/^(db|uploads)-|\.(sqlite|tar\.gz)$/g, "");
        if (base !== keepBase) {
          fs.unlinkSync(path.join(backupDir, f));
          pruned++;
        }
      }
    } else {
      for (const f of files) {
        const full = path.join(backupDir, f);
        if (fs.statSync(full).mtimeMs < cutoff) {
          fs.unlinkSync(full);
          pruned++;
        }
      }
    }
    if (pruned > 0) console.log(`[Backup] Pruned ${pruned} old backup(s)`);
  } catch (e) {
    console.error("[Backup] Prune failed:", e?.message || e);
  }
}

function init() {
  if (isTestEnv() || !getBackupDir()) {
    return;
  }
  // En tests/Jest no programar intervalo (evita que el proceso no termine)
  if (process.env.JEST_WORKER_ID) {
    return;
  }
  runBackup();
  setInterval(runBackup, INTERVAL_MS);
  console.log(`[Backup] Sistema iniciado (intervalo: ${INTERVAL_MS / 3600000}h, retención: ${RETENTION_DAYS}d)`);
}

init();

module.exports = { runBackup, pruneOldBackups };
