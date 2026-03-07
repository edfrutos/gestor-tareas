"use strict";

const { get, all, run } = require("../db/sqlite");
const { logger } = require("../middleware/logger");

let cache = {};
let initialized = false;
let initPromise = null;

/**
 * Carga todas las configuraciones de la DB a la caché
 */
async function initConfig() {
  try {
    const rows = await all("SELECT key, value FROM settings");
    cache = rows.reduce((acc, row) => {
      acc[row.key] = row.value;
      return acc;
    }, {});
    initialized = true;
    logger.info("[config] Settings loaded from DB");
  } catch (err) {
    cache = {};
    initialized = true;
    logger.error({ err }, "[config] Error loading settings from DB");
  } finally {
    initPromise = null;
  }
}

/**
 * Obtiene un valor de configuración
 * @param {string} key 
 * @param {any} defaultValue 
 */
async function getConfigValue(key, defaultValue = null) {
  if (!initialized) {
    if (!initPromise) initPromise = initConfig();
    await initPromise;
  }
  
  if (cache[key] !== undefined) {
    return parseValue(cache[key]);
  }

  // Fallback a variable de entorno si no está en DB
  if (process.env[key] !== undefined) {
    return parseValue(process.env[key]);
  }

  return defaultValue;
}

/**
 * Guarda o actualiza un valor de configuración
 * @param {string} key 
 * @param {string} value 
 */
async function setConfigValue(key, value) {
  const now = new Date().toISOString();
  const stringValue = String(value);
  
  await run(
    `INSERT INTO settings (key, value, updated_at) 
     VALUES (?, ?, ?) 
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [key, stringValue, now]
  );

  cache[key] = stringValue;
  logger.info({ key }, "[config] Setting updated");
}

/**
 * Guarda o actualiza múltiples valores de configuración de forma atómica.
 * Si falla cualquier actualización, se hace rollback de todas.
 * @param {Record<string, any>} updates - Objeto clave-valor con las configuraciones a actualizar
 */
async function setConfigValues(updates) {
  const keys = Object.keys(updates);
  if (keys.length === 0) return;

  const now = new Date().toISOString();
  await run("BEGIN TRANSACTION");
  try {
    for (const key of keys) {
      const stringValue = String(updates[key]);
      await run(
        `INSERT INTO settings (key, value, updated_at) 
         VALUES (?, ?, ?) 
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
        [key, stringValue, now]
      );
      cache[key] = stringValue;
    }
    await run("COMMIT");
    logger.info({ keys }, "[config] Settings updated (batch)");
  } catch (err) {
    await run("ROLLBACK");
    throw err;
  }
}

/**
 * Obtiene todas las configuraciones (para el panel admin)
 */
async function getAllSettings() {
  if (!initialized) {
    if (!initPromise) initPromise = initConfig();
    await initPromise;
  }
  
  // Lista de keys que queremos exponer/gestionar
  const keys = [
    "MAX_UPLOAD_BYTES",
    "RATE_LIMIT_ENABLED",
    "RATE_LIMIT_WINDOW_MS",
    "RATE_LIMIT_MAX",
    "ADMIN_EMAIL",
    "PUBLIC_URL",
    "MAILPIT_URL"
  ];

  const settings = {};
  for (const key of keys) {
    settings[key] = await getConfigValue(key);
  }
  return settings;
}

function parseValue(val) {
  if (val === "true") return true;
  if (val === "false") return false;
  if (typeof val === "string" && val.trim() !== "") {
    const num = Number(val);
    if (Number.isFinite(num)) return num;
  }
  return val;
}

module.exports = {
  getConfigValue,
  setConfigValue,
  setConfigValues,
  getAllSettings,
  initConfig
};
