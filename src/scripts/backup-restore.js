"use strict";

/**
 * Script de restauración desde backup.
 * Uso: node src/scripts/backup-restore.js
 *   - Sin args: lista backups disponibles
 *   - RESTORE=1 BACKUP_DB=/path/db-xxx.sqlite: restaura BD
 *   - RESTORE=1 BACKUP_UPLOADS=/path/uploads-xxx.tar.gz: restaura uploads
 *   - RESTORE=1 con ambos: restaura BD y uploads
 *
 * Por defecto NO restaura (dry-run). RESTORE=1 para ejecutar.
 * NODE_ENV=test: rechazado salvo RESTORE_TO_TEST=1 (para CI).
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { getDbFile, getUploadDir, getBackupDir, isTestEnv } = require("../config/paths");

const RESTORE = process.env.RESTORE === "1";
const RESTORE_TO_TEST = process.env.RESTORE_TO_TEST === "1";
const BACKUP_DB = process.env.BACKUP_DB || "";
const BACKUP_UPLOADS = process.env.BACKUP_UPLOADS || "";

function log(...args) {
  console.log("[backup-restore]", ...args);
}

function listBackups() {
  const backupDir = getBackupDir();
  if (!backupDir || !fs.existsSync(backupDir)) {
    log("No hay directorio de backups o NODE_ENV=test");
    return;
  }
  const files = fs.readdirSync(backupDir);
  const dbFiles = files.filter((f) => f.startsWith("db-") && f.endsWith(".sqlite")).sort().reverse();
  const uploadFiles = files.filter((f) => f.startsWith("uploads-") && f.endsWith(".tar.gz")).sort().reverse();
  log("Backups DB:", dbFiles.slice(0, 10).join(", "), dbFiles.length > 10 ? `... (+${dbFiles.length - 10})` : "");
  log("Backups Uploads:", uploadFiles.slice(0, 10).join(", "), uploadFiles.length > 10 ? `... (+${uploadFiles.length - 10})` : "");
}

function run() {
  console.log("=== BACKUP RESTORE ===");
  log("RESTORE:", RESTORE ? "YES" : "NO (dry-run)");
  log("NODE_ENV:", process.env.NODE_ENV);

  if (isTestEnv() && !RESTORE_TO_TEST) {
    log("Rechazado: NODE_ENV=test. Usa RESTORE_TO_TEST=1 para CI.");
    process.exit(1);
  }

  const backupDir = getBackupDir();
  if (!backupDir) {
    log("No hay directorio de backups configurado.");
    process.exit(1);
  }

  if (!BACKUP_DB && !BACKUP_UPLOADS) {
    listBackups();
    log("Uso: RESTORE=1 BACKUP_DB=<path> [BACKUP_UPLOADS=<path>] node src/scripts/backup-restore.js");
    return;
  }

  const dbFile = getDbFile();
  if (path.basename(dbFile) === "test.db" && !RESTORE_TO_TEST) {
    log("Rechazado: DB apunta a test.db.");
    process.exit(1);
  }

  if (!RESTORE) {
    log("Dry-run. Para restaurar: RESTORE=1");
    if (BACKUP_DB) log("  DB destino:", dbFile, "<-", BACKUP_DB);
    if (BACKUP_UPLOADS) log("  Uploads destino:", getUploadDir(), "<-", BACKUP_UPLOADS);
    return;
  }

  if (BACKUP_DB) {
    const src = path.isAbsolute(BACKUP_DB) ? BACKUP_DB : path.join(backupDir, BACKUP_DB);
    if (!fs.existsSync(src)) {
      log("No existe:", src);
      process.exit(1);
    }
    fs.copyFileSync(src, dbFile);
    log("DB restaurada:", dbFile);
  }

  if (BACKUP_UPLOADS) {
    const src = path.isAbsolute(BACKUP_UPLOADS) ? BACKUP_UPLOADS : path.join(backupDir, BACKUP_UPLOADS);
    if (!fs.existsSync(src)) {
      log("No existe:", src);
      process.exit(1);
    }
    const uploadsDir = getUploadDir();
    const parentDir = path.dirname(uploadsDir);
    execSync(`tar -xzf "${src}" -C "${parentDir}"`, { stdio: "inherit" });
    log("Uploads restaurados en:", uploadsDir);
  }

  log("✅ Restauración completada.");
}

run();
