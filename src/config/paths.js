// src/config/paths.js
"use strict";

const path = require("path");

// Repo root (.. from src/, since this file lives in src/config/)
const ROOT_DIR = path.resolve(__dirname, "..", "..");

function resolveFromRoot(p) {
  if (!p) return p;
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
  const def = path.join(ROOT_DIR, "data", "data.db");
  return resolveFromRoot(process.env.DB_FILE || def);
}

module.exports = {
  ROOT_DIR,
  resolveFromRoot,
  getUploadDir,
  getThumbsDir,
  getDbFile,
};
