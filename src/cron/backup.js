const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");
const { getDbFile, getUploadDir } = require("../config/paths");

// Carpeta de backups dentro del volumen de datos para persistencia
// O idealmente mapeada fuera
const BACKUP_DIR = process.env.BACKUP_DIR || path.join(process.cwd(), "backups");
if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

function runBackup() {
  const now = new Date().toISOString().replace(/[:.]/g, "-");
  const dbFile = getDbFile();
  const uploadsDir = getUploadDir();
  
  // Archivos de destino
  const dbBackup = path.join(BACKUP_DIR, `db-${now}.sqlite`);
  const uploadsBackup = path.join(BACKUP_DIR, `uploads-${now}.tar.gz`);

  // Backup DB (simple copy)
  fs.copyFile(dbFile, dbBackup, (err) => {
    if (err) console.error(`[Backup] DB Failed: ${err.message}`);
    else console.log(`[Backup] DB Saved: ${dbBackup}`);
  });

  // Backup Uploads (tar)
  // tar -czf backup.tar.gz -C /app/ uploads
  const cmd = `tar -czf "${uploadsBackup}" -C "${path.dirname(uploadsDir)}" "${path.basename(uploadsDir)}"`;
  exec(cmd, (err) => {
    if (err) console.error(`[Backup] Uploads Failed: ${err.message}`);
    else console.log(`[Backup] Uploads Saved: ${uploadsBackup}`);
  });
}

console.log("[Backup] Sistema iniciado (Intervalo: 24h)");
// Ejecutar backup cada 24h
setInterval(runBackup, 24 * 60 * 60 * 1000);

module.exports = { runBackup };
