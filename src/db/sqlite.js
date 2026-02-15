// src/db/sqlite.js
const fs = require("fs");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();
const bcrypt = require("bcryptjs");

const { getDbFile } = require("../config/paths");

let db = null;
let dbPromise = null;

function ensureDirForFile(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

async function openDb() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const file = getDbFile();
    ensureDirForFile(file);

    const newDb = new sqlite3.Database(file, (err) => {
      if (err) {
        console.error(`[sqlite] FATAL: Could not open database at ${file}`, err);
        dbPromise = null; // permitir reintento
        return reject(err);
      }

      // Configuración inicial robusta
      newDb.serialize(() => {
        newDb.run("PRAGMA journal_mode=WAL;");
        newDb.run("PRAGMA foreign_keys=ON;");
        newDb.run("PRAGMA busy_timeout=5000;"); // Esperar hasta 5s si está bloqueada
        
        db = newDb;
        resolve(db);
      });
    });

    newDb.on("error", (err) => {
      console.error("[sqlite] Unhandled error:", err);
    });
  });

  return dbPromise;
}

async function migrate() {
  const d = await openDb();

  // Helper local para evitar callbacks anidados
  const exec = (sql, params = []) => new Promise((resolve, reject) => {
    d.run(sql, params, (err) => (err ? reject(err) : resolve()));
  });

  try {
    // 1. Tablas en orden (Users primero por FKs)
    await exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        email TEXT UNIQUE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user',
        created_at TEXT NOT NULL
      )
    `);

    await exec(`
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

    await exec(`
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
        assigned_to INTEGER,
        FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY(map_id) REFERENCES maps(id) ON DELETE SET NULL,
        FOREIGN KEY(assigned_to) REFERENCES users(id) ON DELETE SET NULL
      )
    `);

    await exec(`
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

    await exec(`
      CREATE TABLE IF NOT EXISTS issue_comments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        issue_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        text TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY(issue_id) REFERENCES issues(id) ON DELETE CASCADE,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    await exec(`
      CREATE TABLE IF NOT EXISTS password_resets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        token TEXT NOT NULL UNIQUE,
        expires_at TEXT NOT NULL,
        used INTEGER DEFAULT 0,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // 2. Índices (Solo si la columna existe o se crea abajo)
    await exec(`CREATE INDEX IF NOT EXISTS idx_issue_logs_issue_id ON issue_logs(issue_id)`);
    await exec(`CREATE INDEX IF NOT EXISTS idx_issue_comments_issue_id ON issue_comments(issue_id)`);
    await exec(`CREATE INDEX IF NOT EXISTS idx_password_resets_token ON password_resets(token)`);
    await exec(`CREATE INDEX IF NOT EXISTS idx_issue_logs_created_at ON issue_logs(created_at)`);
    await exec(`CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)`);

    // 3. Datos por defecto (Admin y Mapa)
    const now = new Date().toISOString();
    
    // Admin password
    let adminHash = "system-locked";
    if (process.env.ADMIN_PASSWORD) {
      adminHash = await bcrypt.hash(process.env.ADMIN_PASSWORD, 10);
    }

    await exec(
      "INSERT OR IGNORE INTO users (id, username, password_hash, role, created_at) VALUES (1, 'admin', ?, 'admin', ?)",
      [adminHash, now]
    );

    // Si el admin existe pero está bloqueado y ahora hay una env var, actualizarlo
    if (process.env.ADMIN_PASSWORD) {
       await exec("UPDATE users SET password_hash = ? WHERE id = 1 AND password_hash = 'system-locked'", [adminHash]);
    }

    await exec(
      "INSERT OR IGNORE INTO maps (id, name, file_url, created_by, created_at) VALUES (1, 'Plano Principal', '/ui/plano.jpg', 1, ?)",
      [now]
    );
    
    // Asignar mapa a issues huérfanas
    await exec("UPDATE issues SET map_id = 1 WHERE map_id IS NULL");

    // 4. Migraciones suaves (columnas extra)
    const checkColumns = async (table) => {
      return new Promise((resolve, reject) => {
        d.all(`PRAGMA table_info(${table});`, (err, cols) => (err ? reject(err) : resolve(new Set(cols.map(c => c.name)))));
      });
    };

    const logCols = await checkColumns("issue_logs");
    if (!logCols.has("user_id")) await exec(`ALTER TABLE issue_logs ADD COLUMN user_id INTEGER;`);

    const userCols = await checkColumns("users");
    if (!userCols.has("email")) await exec(`ALTER TABLE users ADD COLUMN email TEXT;`);

    const commentCols = await checkColumns("issue_comments");
    if (!commentCols.has("parent_id")) {
      await exec(`ALTER TABLE issue_comments ADD COLUMN parent_id INTEGER;`);
    }
    await exec(`CREATE INDEX IF NOT EXISTS idx_issue_comments_parent_id ON issue_comments(parent_id)`);

    const mapCols = await checkColumns("maps");
    if (!mapCols.has("archived")) await exec(`ALTER TABLE maps ADD COLUMN archived INTEGER DEFAULT 0;`);

    const issueCols = await checkColumns("issues");
    if (!issueCols.has("thumb_url")) await exec(`ALTER TABLE issues ADD COLUMN thumb_url TEXT;`);
    if (!issueCols.has("photo_url")) await exec(`ALTER TABLE issues ADD COLUMN photo_url TEXT;`);
    if (!issueCols.has("lat")) await exec(`ALTER TABLE issues ADD COLUMN lat REAL;`);
    if (!issueCols.has("lng")) await exec(`ALTER TABLE issues ADD COLUMN lng REAL;`);
    if (!issueCols.has("resolution_photo_url")) await exec(`ALTER TABLE issues ADD COLUMN resolution_photo_url TEXT;`);
    if (!issueCols.has("resolution_thumb_url")) await exec(`ALTER TABLE issues ADD COLUMN resolution_thumb_url TEXT;`);
    if (!issueCols.has("text_url")) await exec(`ALTER TABLE issues ADD COLUMN text_url TEXT;`);
    if (!issueCols.has("resolution_text_url")) await exec(`ALTER TABLE issues ADD COLUMN resolution_text_url TEXT;`);
    
    if (!issueCols.has("created_by")) {
      await exec(`ALTER TABLE issues ADD COLUMN created_by INTEGER REFERENCES users(id) ON DELETE SET NULL;`);
      await exec(`UPDATE issues SET created_by = 1 WHERE created_by IS NULL;`);
    }
    if (!issueCols.has("map_id")) {
      await exec(`ALTER TABLE issues ADD COLUMN map_id INTEGER REFERENCES maps(id) ON DELETE SET NULL;`);
      await exec("UPDATE issues SET map_id = 1 WHERE map_id IS NULL");
    }
    if (!issueCols.has("assigned_to")) {
      await exec(`ALTER TABLE issues ADD COLUMN assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL;`);
    }

    return Promise.resolve();
  } catch (err) {
    console.error("[sqlite] Migration error:", err);
    throw err;
  }
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
  return openDb().then(d => {
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
  });
}

function get(sql, params = []) {
  return openDb().then(d => {
    const safeParams = params.map(p => p === undefined ? null : p);
    return new Promise((resolve, reject) => {
      d.get(sql, safeParams, (err, row) => {
        if (err) return reject(err);
        resolve(row || null);
      });
    });
  });
}

function all(sql, params = []) {
  return openDb().then(d => {
    const safeParams = params.map(p => p === undefined ? null : p);
    return new Promise((resolve, reject) => {
      d.all(sql, safeParams, (err, rows) => {
        if (err) return reject(err);
        resolve(rows || []);
      });
    });
  });
}

module.exports = { openDb, migrate, closeDb, run, get, all };