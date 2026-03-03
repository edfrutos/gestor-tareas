// src/config/paths.js
"use strict";

const path = require("path");
const fs = require("fs");

// Repo root (.. from src/, since this file lives in src/config/)
const ROOT_DIR = path.resolve(__dirname, "..", "..");

// Detect if we are in Docker
const IS_IN_DOCKER = fs.existsSync("/.dockerenv");

function resolveFromRoot(p) {
  if (!p) return p;

  // Si tenemos una ruta absoluta que empieza por /app/ pero NO estamos en Docker,
  // es muy probable que sea una variable de entorno heredada o mal configurada.
  // La convertimos en relativa a ROOT_DIR.
  if (path.isAbsolute(p) && p.startsWith("/app/") && !IS_IN_DOCKER) {
    const relative = p.slice(5); // quita "/app/"
    return path.resolve(ROOT_DIR, relative);
  }

  return path.isAbsolute(p) ? p : path.resolve(ROOT_DIR, p);
}

function getUploadDir() {
  const def = path.join(ROOT_DIR, "uploads");
  return resolveFromRoot(process.env.UPLOAD_DIR || def);
}

function getThumbsDir() {
  return path.join(getUploadDir(), "thumbs");
}

function getDbFile() {
  const isTest = process.env.NODE_ENV === "test";
  const def = path.join(ROOT_DIR, "data", isTest ? "test.db" : "data.db");
  return resolveFromRoot(process.env.DB_FILE || def);
}

/** @returns {boolean} true si estamos en entorno de tests */
function isTestEnv() {
  return process.env.NODE_ENV === "test";
}

/**
 * Directorio de backups. NUNCA debe usarse cuando NODE_ENV=test.
 * @returns {string|null} ruta del directorio o null si es entorno test
 */
function getBackupDir() {
  if (isTestEnv()) return null;
  const def = path.join(ROOT_DIR, "backups");
  return resolveFromRoot(process.env.BACKUP_DIR || def);
}

module.exports = {
  ROOT_DIR,
  resolveFromRoot,
  getUploadDir,
  getThumbsDir,
  getDbFile,
  isTestEnv,
  getBackupDir,
};
