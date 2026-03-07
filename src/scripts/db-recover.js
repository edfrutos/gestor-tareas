"use strict";

/**
 * Procedimiento de recuperación ante SQLITE_CORRUPT.
 * Usa sqlite3 CLI (.recover) para extraer datos de una BD corrupta.
 *
 * Uso:
 *   node src/scripts/db-recover.js [--dry-run]
 *   DB_FILE=/path/to/data.db node src/scripts/db-recover.js
 *
 * Requiere: sqlite3 CLI instalado (apt install sqlite3 en Docker).
 * Si no está disponible, imprime instrucciones manuales.
 */

const fs = require("fs");
const path = require("path");
const { execSync, spawnSync } = require("child_process");
const { getDbFile, getBackupDir, isTestEnv } = require("../config/paths");

const DRY_RUN = process.argv.includes("--dry-run");

function log(...args) {
  console.log("[db-recover]", ...args);
}

function hasSqlite3Cli() {
  try {
    spawnSync("sqlite3", ["--version"], { encoding: "utf8" });
    return true;
  } catch {
    return false;
  }
}

function run() {
  console.log("=== DB RECOVERY (SQLITE_CORRUPT) ===\n");

  if (isTestEnv()) {
    log("Rechazado: NODE_ENV=test.");
    process.exit(1);
  }

  const dbFile = getDbFile();
  if (path.basename(dbFile) === "test.db") {
    log("Rechazado: DB apunta a test.db.");
    process.exit(1);
  }

  if (!fs.existsSync(dbFile)) {
    log("No existe:", dbFile);
    process.exit(1);
  }

  const backupDir = getBackupDir();
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const recoveredPath = backupDir
    ? path.join(backupDir, `recovered-${timestamp}.sqlite`)
    : path.join(path.dirname(dbFile), `recovered-${timestamp}.sqlite`);

  if (!hasSqlite3Cli()) {
    log("sqlite3 CLI no encontrado. Instálalo:");
    log("  - Docker: apt-get install sqlite3");
    log("  - macOS: brew install sqlite");
    log("");
    log("Procedimiento manual:");
    log(`  1. Detener la aplicación`);
    log(`  2. cp "${dbFile}" "${dbFile}.corrupt"`);
    log(`  3. sqlite3 "${dbFile}" ".recover" | sqlite3 "${recoveredPath}"`);
    log(`  4. Verificar: sqlite3 "${recoveredPath}" "PRAGMA integrity_check;"`);
    log(`  5. mv "${recoveredPath}" "${dbFile}"`);
    log(`  6. Reiniciar la aplicación`);
    process.exit(1);
  }

  log("IMPORTANTE: Detén la aplicación antes de ejecutar la recuperación.");
  log("");

  if (DRY_RUN) {
    log("Dry-run. Se ejecutaría:");
    log(`  1. Respaldo previo: cp "${dbFile}" "${dbFile}.pre-recover"`);
    log(`  2. .recover: sqlite3 "${dbFile}" ".recover" | sqlite3 "${recoveredPath}"`);
    log(`  3. Verificación: PRAGMA integrity_check en ${recoveredPath}`);
    log(`  4. Sustitución: mv "${recoveredPath}" "${dbFile}"`);
    return;
  }

  const preRecoverBackup = `${dbFile}.pre-recover-${timestamp}`;
  log("1. Respaldo previo:", preRecoverBackup);
  fs.copyFileSync(dbFile, preRecoverBackup);

  log("2. Ejecutando .recover...");
  try {
    const recoveredDir = path.dirname(recoveredPath);
    if (!fs.existsSync(recoveredDir)) fs.mkdirSync(recoveredDir, { recursive: true });

    execSync(`sqlite3 "${dbFile}" ".recover" | sqlite3 "${recoveredPath}"`, {
      stdio: "inherit",
      maxBuffer: 50 * 1024 * 1024,
    });
  } catch (err) {
    log("Error en .recover:", err.message);
    log("El respaldo previo está en:", preRecoverBackup);
    process.exit(1);
  }

  log("3. Verificando integridad...");
  try {
    const out = execSync(`sqlite3 "${recoveredPath}" "PRAGMA integrity_check;"`, {
      encoding: "utf8",
    }).trim();
    if (out !== "ok") {
      log("ADVERTENCIA: integrity_check no es 'ok':", out);
    } else {
      log("Integridad OK");
    }
  } catch (e) {
    log("Error verificando:", e.message);
  }

  log("4. Sustituyendo BD original...");
  fs.renameSync(recoveredPath, dbFile);

  log("✅ Recuperación completada. Reinicia la aplicación.");
  log("Respaldo pre-recuperación:", preRecoverBackup);
}

run();
