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

  return new Promise((resolve, reject) => {
    d.serialize(() => {
      // 1. Tablas en orden (Users primero por FKs)
      d.run(`
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT NOT NULL UNIQUE,
          password_hash TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'user',
          created_at TEXT NOT NULL
        )
      `);

      d.run(`
        CREATE TABLE IF NOT EXISTS maps (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          file_url TEXT NOT NULL,
          thumb_url TEXT,
          created_by INTEGER NOT NULL,
          created_at TEXT NOT NULL,
          FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE CASCADE
        )
      `);

      d.run(`
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
          created_at TEXT NOT NULL,
          created_by INTEGER,
          map_id INTEGER,
          FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE SET NULL,
          FOREIGN KEY(map_id) REFERENCES maps(id) ON DELETE SET NULL
        )
      `);

      d.run(`
        CREATE TABLE IF NOT EXISTS issue_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          issue_id INTEGER NOT NULL,
          user_id INTEGER,
          action TEXT NOT NULL,
          old_value TEXT,
          new_value TEXT,
          created_at TEXT NOT NULL,
          FOREIGN KEY(issue_id) REFERENCES issues(id) ON DELETE CASCADE,
          FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL
        )
      `);

      // 2. Índices
      d.run(`CREATE INDEX IF NOT EXISTS idx_issue_logs_issue_id ON issue_logs(issue_id)`);
      d.run(`CREATE INDEX IF NOT EXISTS idx_issue_logs_created_at ON issue_logs(created_at)`);
      d.run(`CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)`);

      // 3. Datos por defecto (Admin y Mapa)
      const now = new Date().toISOString();
      d.run(
        "INSERT OR IGNORE INTO users (id, username, password_hash, role, created_at) VALUES (1, 'admin', 'system-locked', 'admin', ?)",
        [now]
      );

      d.run(
        "INSERT OR IGNORE INTO maps (id, name, file_url, created_by, created_at) VALUES (1, 'Plano Principal', '/ui/plano.jpg', 1, ?)",
        [now],
        () => {
          // Asignar mapa a issues huérfanas
          d.run("UPDATE issues SET map_id = 1 WHERE map_id IS NULL");
        }
      );

      // 4. Migraciones suaves (columnas extra)
      d.all(`PRAGMA table_info(issue_logs);`, (err, cols) => {
        if (err) return;
        const names = new Set((cols || []).map((c) => c.name));
        if (!names.has("user_id")) d.run(`ALTER TABLE issue_logs ADD COLUMN user_id INTEGER;`);
      });

      d.all(`PRAGMA table_info(issues);`, (err, cols) => {
        if (err) return;
        const names = new Set((cols || []).map((c) => c.name));
        if (!names.has("thumb_url")) d.run(`ALTER TABLE issues ADD COLUMN thumb_url TEXT;`);
        if (!names.has("photo_url")) d.run(`ALTER TABLE issues ADD COLUMN photo_url TEXT;`);
        if (!names.has("lat")) d.run(`ALTER TABLE issues ADD COLUMN lat REAL;`);
        if (!names.has("lng")) d.run(`ALTER TABLE issues ADD COLUMN lng REAL;`);
        if (!names.has("resolution_photo_url")) d.run(`ALTER TABLE issues ADD COLUMN resolution_photo_url TEXT;`);
        if (!names.has("resolution_thumb_url")) d.run(`ALTER TABLE issues ADD COLUMN resolution_thumb_url TEXT;`);
        if (!names.has("text_url")) d.run(`ALTER TABLE issues ADD COLUMN text_url TEXT;`);
        if (!names.has("resolution_text_url")) d.run(`ALTER TABLE issues ADD COLUMN resolution_text_url TEXT;`);
        
        if (!names.has("created_by")) {
          d.run(`ALTER TABLE issues ADD COLUMN created_by INTEGER REFERENCES users(id) ON DELETE SET NULL;`, () => {
            d.run(`UPDATE issues SET created_by = 1 WHERE created_by IS NULL;`);
          });
        }
        if (!names.has("map_id")) {
          d.run(`ALTER TABLE issues ADD COLUMN map_id INTEGER REFERENCES maps(id) ON DELETE SET NULL;`, () => {
             d.run("UPDATE issues SET map_id = 1 WHERE map_id IS NULL");
          });
        }
      });

      // Finalizar
      d.get("SELECT 1", (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
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