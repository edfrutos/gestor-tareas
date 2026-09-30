// src/db/sqlite.js
//
// Acceso a SQLite con `node:sqlite` (módulo incluido en Node >= 22.13; sin
// dependencias nativas). La API de este módulo (openDb, migrate, closeDb,
// run, get, all, integrityCheck) es la misma que con el antiguo paquete
// `sqlite3`: el resto de la app no depende del driver.
//
// `node:sqlite` es síncrono. Las funciones se mantienen `async` para no
// cambiar a quien las usa; con consultas por clave sobre una BD pequeña el
// bloqueo es de microsegundos.
const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");
const bcrypt = require("bcryptjs");

const { getDbFile } = require("../config/paths");

let db = null;

// SQLite en modo WAL usa locking por mmap sobre un archivo -shm compartido.
// Docker Desktop para Mac no soporta bien ese locking cuando el bind mount
// apunta a un volumen externo (no el disco interno) — da SQLITE_IOERR al
// primer acceso. Permite bajar a un journal_mode sin mmap (DELETE, el
// clásico rollback journal) solo para ese caso vía env var; en producción
// (Linux nativo, sin esa capa de virtualización) se deja WAL por defecto.
const VALID_JOURNAL_MODES = new Set(["DELETE", "TRUNCATE", "PERSIST", "MEMORY", "WAL", "OFF"]);
const requestedJournalMode = (process.env.SQLITE_JOURNAL_MODE || "WAL").toUpperCase();
const JOURNAL_MODE = VALID_JOURNAL_MODES.has(requestedJournalMode) ? requestedJournalMode : "WAL";

// Códigos primarios de SQLite (errcode & 0xff). node:sqlite lanza errores con
// code "ERR_SQLITE_ERROR" y el código numérico en `errcode`; se traducen a los
// nombres que usaba `sqlite3` (p. ej. la detección de SQLITE_CORRUPT).
const SQLITE_CODE_NAMES = {
  1: "SQLITE_ERROR", 5: "SQLITE_BUSY", 6: "SQLITE_LOCKED", 8: "SQLITE_READONLY",
  10: "SQLITE_IOERR", 11: "SQLITE_CORRUPT", 13: "SQLITE_FULL", 14: "SQLITE_CANTOPEN",
  19: "SQLITE_CONSTRAINT", 26: "SQLITE_NOTADB",
};

function normalizeError(err) {
  if (err && typeof err.errcode === "number") {
    const name = SQLITE_CODE_NAMES[err.errcode & 0xff];
    if (name) err.code = name;
  }
  return err;
}

function isCorruption(err) {
  return err?.code === "SQLITE_CORRUPT" || err?.code === "SQLITE_NOTADB" ||
    /SQLITE_CORRUPT|malformed/i.test(err?.message || "");
}

// node:sqlite no admite `undefined` (y en Node 22 tampoco booleanos) como
// parámetro: se convierten como hacía `sqlite3` (NULL y 1/0).
function bindParams(params = []) {
  return params.map((p) => (p === undefined ? null : typeof p === "boolean" ? (p ? 1 : 0) : p));
}

// Las filas de node:sqlite son objetos sin prototipo; se devuelven como
// objetos normales, igual que antes.
const toPlainRow = (row) => (row ? { ...row } : null);

function ensureDirForFile(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

async function openDb() {
  if (db) return db;

  const file = getDbFile();
  ensureDirForFile(file);

  let newDb;
  try {
    newDb = new DatabaseSync(file);
    // busy_timeout va PRIMERO: cambiar journal_mode necesita un bloqueo y, si
    // otra conexión (otro proceso, un script, un test en paralelo) tiene la BD
    // ocupada, sin espera fallaría al instante con "database is locked".
    // (El paquete `sqlite3` aplicaba 1 s de espera por defecto al abrir.)
    newDb.exec("PRAGMA busy_timeout=5000;");
    // Configuración inicial robusta (mitigación SQLITE_CORRUPT - Fase 36)
    newDb.exec(`
      PRAGMA journal_mode=${JOURNAL_MODE};
      PRAGMA foreign_keys=ON;
      PRAGMA synchronous=FULL;
      PRAGMA temp_store=MEMORY;
    `);
  } catch (err) {
    normalizeError(err);
    try { newDb?.close(); } catch (_e) { /* noop */ }
    console.error(`[sqlite] FATAL: Could not open database at ${file}`, err);
    if (isCorruption(err)) {
      console.error("[sqlite] CORRUPTION DETECTED. See docs/RECOVERY.md or run: node src/scripts/db-recover.js");
    }
    throw err;
  }

  db = newDb;
  return db;
}

async function migrate() {
  const d = await openDb();

  const exec = async (sql, params = []) => {
    d.prepare(sql).run(...bindParams(params));
  };

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
        parent_id INTEGER,
        created_by INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY(parent_id) REFERENCES maps(id) ON DELETE CASCADE,
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

    await exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);

    await exec(`
      CREATE TABLE IF NOT EXISTS map_zones (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        map_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        geojson TEXT NOT NULL,
        color TEXT NOT NULL DEFAULT '#3388ff',
        created_by INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY(map_id) REFERENCES maps(id) ON DELETE CASCADE,
        FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // Mensajes del formulario de contacto. Se guardan aunque falle el SMTP
    // (sendMail no lanza), para no perder ninguno. `user_id` es opcional:
    // el formulario también se usa desde el login, sin sesión.
    await exec(`
      CREATE TABLE IF NOT EXISTS contact_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        subject TEXT NOT NULL,
        message TEXT NOT NULL,
        source TEXT,
        ip TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL
      )
    `);

    // 2. Índices (Solo si la columna existe o se crea abajo)
    await exec(`CREATE INDEX IF NOT EXISTS idx_issue_logs_issue_id ON issue_logs(issue_id)`);
    await exec(`CREATE INDEX IF NOT EXISTS idx_issue_comments_issue_id ON issue_comments(issue_id)`);
    await exec(`CREATE INDEX IF NOT EXISTS idx_password_resets_token ON password_resets(token)`);
    await exec(`CREATE INDEX IF NOT EXISTS idx_issue_logs_created_at ON issue_logs(created_at)`);
    await exec(`CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)`);
    await exec(`CREATE INDEX IF NOT EXISTS idx_map_zones_map_id ON map_zones(map_id)`);

    // 3. Datos por defecto (Admin y Mapa)
    const now = new Date().toISOString();
    
    // Admin password
    let adminHash = "system-locked";
    if (process.env.ADMIN_PASSWORD) {
      adminHash = await bcrypt.hash(process.env.ADMIN_PASSWORD, 10);
    }

    // Asegurar usuario admin (ID 1 es preferido pero no obligatorio si ya existe un admin)
    await exec(
      "INSERT OR IGNORE INTO users (id, username, password_hash, role, created_at) VALUES (1, 'admin', ?, 'admin', ?)",
      [adminHash, now]
    );

    // Obtener un ID de administrador válido para el mapa (preferiblemente el 1)
    let adminUser = await get("SELECT id FROM users WHERE role = 'admin' ORDER BY id ASC LIMIT 1");

    if (!adminUser) {
      console.warn("[sqlite] No admin user found; attempting to fix by promoting id=1 to admin");
      await exec("UPDATE users SET role = 'admin', password_hash = ? WHERE id = 1", [adminHash]);
      adminUser = await get("SELECT id FROM users WHERE role = 'admin' ORDER BY id ASC LIMIT 1");
    }

    const adminId = adminUser ? adminUser.id : (await get("SELECT id FROM users ORDER BY id ASC LIMIT 1"))?.id ?? null;

    // Si el admin existe pero está bloqueado y ahora hay una env var, actualizarlo
    if (adminUser && process.env.ADMIN_PASSWORD) {
      await exec("UPDATE users SET password_hash = ? WHERE id = ? AND password_hash = 'system-locked'", [adminHash, adminId]);
    }

    if (adminId !== null) {
      await exec(
        "INSERT OR IGNORE INTO maps (id, name, file_url, created_by, created_at) VALUES (1, 'Plano Principal', '/ui/plano.jpg', ?, ?)",
        [adminId, now]
      );
    } else {
      console.warn("[sqlite] No user found for maps.created_by; skipping default map insert");
    }
    
    // Asignar mapa a issues huérfanas
    await exec("UPDATE issues SET map_id = 1 WHERE map_id IS NULL");

    // 4. Migraciones suaves (columnas extra)
    const checkColumns = async (table) =>
      new Set(d.prepare(`PRAGMA table_info(${table});`).all().map((c) => c.name));

    const logCols = await checkColumns("issue_logs");
    if (!logCols.has("user_id")) await exec(`ALTER TABLE issue_logs ADD COLUMN user_id INTEGER;`);

    const userCols = await checkColumns("users");
    if (!userCols.has("email")) await exec(`ALTER TABLE users ADD COLUMN email TEXT;`);
    if (!userCols.has("avatar_url")) await exec(`ALTER TABLE users ADD COLUMN avatar_url TEXT;`);
    if (!userCols.has("avatar_thumb_url")) await exec(`ALTER TABLE users ADD COLUMN avatar_thumb_url TEXT;`);
    // Versión de sesión: subirla revoca todos los JWT del usuario (session.service.js)
    if (!userCols.has("token_version")) await exec(`ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0;`);

    const commentCols = await checkColumns("issue_comments");
    if (!commentCols.has("parent_id")) {
      await exec(`ALTER TABLE issue_comments ADD COLUMN parent_id INTEGER;`);
    }
    await exec(`CREATE INDEX IF NOT EXISTS idx_issue_comments_parent_id ON issue_comments(parent_id)`);

    const mapCols = await checkColumns("maps");
    if (!mapCols.has("archived")) await exec(`ALTER TABLE maps ADD COLUMN archived INTEGER DEFAULT 0;`);
    if (!mapCols.has("parent_id")) await exec(`ALTER TABLE maps ADD COLUMN parent_id INTEGER REFERENCES maps(id) ON DELETE CASCADE;`);

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
    if (!issueCols.has("priority")) {
      await exec(`ALTER TABLE issues ADD COLUMN priority TEXT NOT NULL DEFAULT 'medium';`);
    }
    if (!issueCols.has("due_date")) {
      await exec(`ALTER TABLE issues ADD COLUMN due_date TEXT;`);
    }

    return Promise.resolve();
  } catch (err) {
    normalizeError(err);
    console.error("[sqlite] Migration error:", err);
    throw err;
  }
}


async function closeDb() {
  if (!db) return;
  const d = db;
  db = null;
  d.close();
}

async function run(sql, params = []) {
  const d = await openDb();
  const safeParams = bindParams(params);
  try {
    const res = d.prepare(sql).run(...safeParams);
    return { changes: res.changes, lastID: Number(res.lastInsertRowid) };
  } catch (err) {
    normalizeError(err);
    console.error("[sqlite] run error:", err, "SQL:", sql, "Params:", safeParams);
    throw err;
  }
}

async function get(sql, params = []) {
  const d = await openDb();
  try {
    return toPlainRow(d.prepare(sql).get(...bindParams(params)));
  } catch (err) {
    throw normalizeError(err);
  }
}

async function all(sql, params = []) {
  const d = await openDb();
  try {
    return d.prepare(sql).all(...bindParams(params)).map(toPlainRow);
  } catch (err) {
    throw normalizeError(err);
  }
}

/**
 * Ejecuta PRAGMA integrity_check. Útil para detectar corrupción.
 * @returns {Promise<{ok: boolean, result?: string}>}
 */
async function integrityCheck() {
  try {
    const d = await openDb();
    const row = d.prepare("PRAGMA integrity_check;").get();
    const result = row ? row.integrity_check : "unknown";
    return { ok: result === "ok", result };
  } catch (err) {
    return { ok: false, result: normalizeError(err).message };
  }
}

module.exports = { openDb, migrate, closeDb, run, get, all, integrityCheck };