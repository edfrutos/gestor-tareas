// src/config/paths.js
"use strict";

const path = require("path");
const fs = require("fs");

// Repo root (.. from src/, since this file lives in src/config/)
const ROOT_DIR = path.resolve(__dirname, "..", "..");

// Detect if we are in Docker
const IS_IN_DOCKER = fs.existsSync("/.dockerenv");

/**
 * Comprueba si la ruta contiene el segmento ".." (path traversal).
 * Permite nombres como "foto..bak" pero rechaza "a/../b" o "..".
 */
function hasParentSegment(s) {
  const segments = s.split(/[/\\]/);
  return segments.some((seg) => seg === "..");
}

/**
 * Resuelve una ruta relativa dentro de baseDir y verifica que no escape (path traversal).
 * Rechaza: rutas absolutas, segmentos "..", caracteres nulos.
 * @param {string} baseDir - Directorio base
 * @param {string} input - Ruta relativa controlada por usuario
 * @returns {string|null} Ruta absoluta segura o null si es inválida
 */
function resolveSafe(baseDir, input) {
  if (!input || typeof input !== "string") return null;
  const s = input.trim();
  if (!s) return null;
  if (path.isAbsolute(s) || hasParentSegment(s) || s.includes("\0")) return null;
  const base = path.resolve(baseDir);
  const resolved = path.resolve(base, s);
  return resolved === base || resolved.startsWith(base + path.sep) ? resolved : null;
}

function resolveFromRoot(p, fallback) {
  if (!p) return fallback != null ? fallback : p;

  let toResolve = p;
  // Si tenemos una ruta absoluta que empieza por /app/ pero NO estamos en Docker,
  // es muy probable que sea una variable de entorno heredada o mal configurada.
  // La convertimos en relativa a ROOT_DIR.
  if (path.isAbsolute(p) && p.startsWith("/app/") && !IS_IN_DOCKER) {
    toResolve = p.slice(5); // quita "/app/"
  }

  // Rutas absolutas explícitas (env) se aceptan; solo rechazamos segmentos .. y \0
  if (hasParentSegment(toResolve) || toResolve.includes("\0")) return fallback != null ? fallback : p;
  if (path.isAbsolute(toResolve)) return toResolve;
  const resolved = path.resolve(ROOT_DIR, toResolve);
  const rootResolved = path.resolve(ROOT_DIR);
  if (resolved === rootResolved || resolved.startsWith(rootResolved + path.sep)) {
    return resolved;
  }
  return fallback != null ? fallback : p;
}

function getUploadDir() {
  const def = path.join(ROOT_DIR, "uploads");
  return resolveFromRoot(process.env.UPLOAD_DIR || def, def);
}

function getThumbsDir() {
  return path.join(getUploadDir(), "thumbs");
}

function getDbFile() {
  const isTest = process.env.NODE_ENV === "test";
  const def = path.join(ROOT_DIR, "data", isTest ? "test.db" : "data.db");
  return resolveFromRoot(process.env.DB_FILE || def, def);
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
  return resolveFromRoot(process.env.BACKUP_DIR || def, def);
}

module.exports = {
  ROOT_DIR,
  resolveFromRoot,
  resolveSafe,
  getUploadDir,
  getThumbsDir,
  getDbFile,
  isTestEnv,
  getBackupDir,
};
