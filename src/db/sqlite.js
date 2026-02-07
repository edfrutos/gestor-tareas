// src/db/sqlite.js
const fs = require("fs");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();

const { getDbFile } = require("../config/paths");

let db = null;

function ensureDirForFile(filePath) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
}

function openDb() {
  if (db) return db;

  const file = getDbFile();
  ensureDirForFile(file);

  db = new sqlite3.Database(file, (err) => {
    if (err) {
      console.error(`[sqlite] FATAL: Could not open database at ${file}`, err);
    }
  });
  
  db.on("error", (err) => {
    console.error("[sqlite] Unhandled error:", err);
  });

  // Pragmas razonables
  db.exec("PRAGMA journal_mode=WAL;");
  db.exec("PRAGMA foreign_keys=ON;");

  return db;
}

function migrate() {
  const d = openDb();

  // Tabla base (para instalaciones nuevas)
  d.exec(`
    CREATE TABLE IF NOT EXISTS issues (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      photo_url TEXT,
      thumb_url TEXT,
      text_url TEXT,
      resolution_photo_url TEXT,
      resolution_thumb_url TEXT,
      resolution_text_url TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_issues_created_at ON issues(created_at);
    CREATE INDEX IF NOT EXISTS idx_issues_status ON issues(status);
    CREATE INDEX IF NOT EXISTS idx_issues_category ON issues(category);
  `);

  // Migración “suave” para bases existentes:
  // - si la columna no existe, la añadimos
  d.all(`PRAGMA table_info(issues);`, (err, cols) => {
    if (err) return; // no reventamos migración por esto

    const names = new Set((cols || []).map((c) => c.name));
    if (!names.has("thumb_url")) {
      d.exec(`ALTER TABLE issues ADD COLUMN thumb_url TEXT;`);
    }
    if (!names.has("photo_url")) {
      d.exec(`ALTER TABLE issues ADD COLUMN photo_url TEXT;`);
    }
    // lat/lng deberían existir ya, pero si vienes de una BD antigua rara:
    if (!names.has("lat")) d.exec(`ALTER TABLE issues ADD COLUMN lat REAL;`);
    if (!names.has("lng")) d.exec(`ALTER TABLE issues ADD COLUMN lng REAL;`);
    if (!names.has("resolution_photo_url")) {
      d.exec(`ALTER TABLE issues ADD COLUMN resolution_photo_url TEXT;`);
    }
    if (!names.has("resolution_thumb_url")) {
      d.exec(`ALTER TABLE issues ADD COLUMN resolution_thumb_url TEXT;`);
    }
    if (!names.has("text_url")) {
      d.exec(`ALTER TABLE issues ADD COLUMN text_url TEXT;`);
    }
    if (!names.has("resolution_text_url")) {
      d.exec(`ALTER TABLE issues ADD COLUMN resolution_text_url TEXT;`);
    }
  });
}

function closeDb() {
  return new Promise((resolve, reject) => {
    if (!db) return resolve();
    db.close((err) => {
      if (err) return reject(err);
      db = null;
      resolve();
    });
  });
}

function run(sql, params = []) {
  const d = openDb();
  const safeParams = params.map(p => p === undefined ? null : p);
  return new Promise((resolve, reject) => {
    d.run(sql, safeParams, function (err) {
      if (err) {
        console.error("[sqlite] run error:", err, "SQL:", sql, "Params:", safeParams);
        return reject(err);
      }
      resolve({ changes: this.changes, lastID: this.lastID });
    });
  });
}

function get(sql, params = []) {
  const d = openDb();
  const safeParams = params.map(p => p === undefined ? null : p);
  return new Promise((resolve, reject) => {
    d.get(sql, safeParams, (err, row) => {
      if (err) return reject(err);
      resolve(row || null);
    });
  });
}

function all(sql, params = []) {
  const d = openDb();
  const safeParams = params.map(p => p === undefined ? null : p);
  return new Promise((resolve, reject) => {
    d.all(sql, safeParams, (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });
}

module.exports = { openDb, migrate, closeDb, run, get, all };