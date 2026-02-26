"use strict";

const { get, all, run } = require("../db/sqlite");
const { logger } = require("../middleware/logger");

let cache = {};
let initialized = false;

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
    logger.error({ err }, "[config] Error loading settings from DB");
  }
}

/**
 * Obtiene un valor de configuración
 * @param {string} key 
 * @param {any} defaultValue 
 */
async function getConfigValue(key, defaultValue = null) {
  if (!initialized) await initConfig();
  
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
  logger.info({ key, value: stringValue }, "[config] Setting updated");
}

/**
 * Obtiene todas las configuraciones (para el panel admin)
 */
async function getAllSettings() {
  if (!initialized) await initConfig();
  
  // Lista de keys que queremos exponer/gestionar
  const keys = [
    "MAX_UPLOAD_BYTES",
    "RATE_LIMIT_ENABLED",
    "RATE_LIMIT_WINDOW_MS",
    "RATE_LIMIT_MAX",
    "ADMIN_EMAIL",
    "PUBLIC_URL"
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
  if (typeof val === "string" && !isNaN(val) && val.trim() !== "") return Number(val);
  return val;
}

module.exports = {
  getConfigValue,
  setConfigValue,
  getAllSettings,
  initConfig
};
