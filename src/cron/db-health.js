"use strict";

/**
 * Monitoreo periódico de integridad de la BD (PRAGMA integrity_check).
 * Detecta corrupción y registra alertas para mitigación SQLITE_CORRUPT.
 */

const { integrityCheck } = require("../db/sqlite");
const { isTestEnv, getBackupDir } = require("../config/paths");

const INTERVAL_MS = Number(process.env.DB_INTEGRITY_INTERVAL_MS || 6 * 60 * 60 * 1000); // 6h por defecto

let lastResult = { ok: null, result: null, at: null };

function getLastIntegrityResult() {
  return lastResult;
}

async function runIntegrityCheck() {
  if (isTestEnv() || !getBackupDir()) return;

  try {
    const { ok, result } = await integrityCheck();
    lastResult = { ok, result, at: new Date().toISOString() };

    if (!ok) {
      console.error("[DB-Health] INTEGRITY CHECK FAILED:", result);
      console.error("[DB-Health] Run recovery: node src/scripts/db-recover.js");
    } else {
      console.log("[DB-Health] integrity_check OK");
    }
  } catch (err) {
    lastResult = { ok: false, result: err.message, at: new Date().toISOString() };
    console.error("[DB-Health] integrity_check error:", err.message);
  }
}

function init() {
  if (isTestEnv() || !getBackupDir()) return;

  runIntegrityCheck();
  setInterval(runIntegrityCheck, INTERVAL_MS);
  console.log(`[DB-Health] Monitor iniciado (intervalo: ${INTERVAL_MS / 3600000}h)`);
}

init();

module.exports = { runIntegrityCheck, getLastIntegrityResult };
