"use strict";

const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");
const { getDbFile, getUploadDir, getBackupDir, isTestEnv } = require("../config/paths");
const { openDb } = require("../db/sqlite");
const { backup: sqliteBackup } = require("node:sqlite");

// Retención: días a conservar (full backups). Por defecto 7.
const RETENTION_DAYS = Number(process.env.BACKUP_RETENTION_DAYS || 7);
const INTERVAL_MS = Number(process.env.BACKUP_INTERVAL_MS || 24 * 60 * 60 * 1000);

/**
 * Backup de BD con la Backup API de SQLite (`backup()` de node:sqlite):
 * copia consistente en caliente, incluidos los cambios que aún están en el
 * fichero -wal. Una copia de fichero (fs.copyFile) los perdería en modo WAL,
 * así que solo se usa si la API no existe (Node < 22.16).
 */
function backupDbToFile(dbFile, destPath, cb) {
  openDb()
    .then((db) => {
      if (typeof sqliteBackup !== "function") {
        fs.copyFile(dbFile, destPath, cb);
        return;
      }
      sqliteBackup(db, destPath).then(() => cb(null), (err) => cb(err));
    })
    .catch((err) => cb(err));
}

/**
 * Copia la BD y los uploads. La promesa se resuelve cuando han terminado
 * AMBAS copias (y la poda de copias antiguas), nunca antes.
 */
function runBackup() {
  const backupDir = getBackupDir();
  if (!backupDir) {
    console.warn("[Backup] Deshabilitado en NODE_ENV=test (nunca respaldar BD de tests)");
    return Promise.resolve();
  }

  const dbFile = getDbFile();
  if (path.basename(dbFile) === "test.db") {
    console.warn("[Backup] Rechazado: DB apunta a test.db. Verifica NODE_ENV y DB_FILE.");
    return Promise.resolve();
  }

  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

  const now = new Date().toISOString().replace(/[:.]/g, "-");
  const uploadsDir = getUploadDir();
  const dbBackup = path.join(backupDir, `db-${now}.sqlite`);
  const uploadsBackup = path.join(backupDir, `uploads-${now}.tar.gz`);

  const parentDir = path.dirname(uploadsDir);
  const uploadsBasename = path.basename(uploadsDir);
  const cmd = `tar -czf "${uploadsBackup}" -C "${parentDir}" "${uploadsBasename}"`;
  const uploadsDone = new Promise((resolve) => {
    exec(cmd, (err) => {
      if (err) console.error(`[Backup] Uploads Failed: ${err.message}`);
      else console.log(`[Backup] Uploads Saved: ${uploadsBackup}`);
      resolve();
    });
  });

  const dbDone = new Promise((resolve) => {
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
      resolve();
    });
  });

  return Promise.all([uploadsDone, dbDone]).then(() => {
    // Las copias contienen la BD completa y todos los uploads: solo el
    // propietario puede leerlas, aunque el proceso que las crea no tenga la
    // umask de server.js (p. ej. `npm run backup` con docker exec).
    for (const f of [dbBackup, uploadsBackup]) {
      try { fs.chmodSync(f, 0o600); } catch (_e) { /* la copia pudo fallar */ }
    }
    pruneOldBackups(backupDir);
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

module.exports = { runBackup, pruneOldBackups, backupDbToFile };
