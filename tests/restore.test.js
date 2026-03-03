"use strict";

/**
 * Test de restauración desde backup.
 * Verifica que backup → restore → verificación funcione correctamente.
 * Incluye integrity_check post-restore (mitigación SQLITE_CORRUPT).
 */

const fs = require("fs");
const path = require("path");
const os = require("os");

// Configurar env antes de cargar módulos que dependen de paths
const TEST_DIR = path.join(os.tmpdir(), `gestor-tareas-restore-test-${Date.now()}`);
const RESTORE_DIR = path.join(TEST_DIR, "restored");

process.env.DB_FILE = path.join(TEST_DIR, "data", "data.db");
process.env.UPLOAD_DIR = path.join(TEST_DIR, "uploads");
process.env.BACKUP_DIR = path.join(TEST_DIR, "backups");
process.env.NODE_ENV = "production";

beforeAll(() => {
  fs.mkdirSync(TEST_DIR, { recursive: true });
  fs.mkdirSync(RESTORE_DIR, { recursive: true });
  fs.mkdirSync(path.join(TEST_DIR, "data"), { recursive: true });
  fs.mkdirSync(path.join(TEST_DIR, "uploads"), { recursive: true });
  fs.mkdirSync(path.join(TEST_DIR, "backups"), { recursive: true });
});

afterAll(() => {
  try {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  } catch (e) {
    console.error(e);
  }
});

test("backup and restore cycle works", async () => {
  const sqlite = require("../src/db/sqlite");
  const { migrate, closeDb, run, get, integrityCheck } = sqlite;

  await migrate();
  await run(
    "INSERT INTO issues (title, category, description, lat, lng, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ["Restore Test", "test", "Fixture for restore", 0, 0, "open", new Date().toISOString()]
  );
  const before = await get("SELECT COUNT(*) as n FROM issues");
  await closeDb();

  const { runBackup } = require("../src/cron/backup");
  await runBackup();

  const backups = fs.readdirSync(path.join(TEST_DIR, "backups"));
  const dbBackup = backups.find((f) => f.startsWith("db-") && f.endsWith(".sqlite"));
  expect(dbBackup).toBeDefined();

  process.env.DB_FILE = path.join(RESTORE_DIR, "data.db");
  process.env.BACKUP_DIR = path.join(TEST_DIR, "backups");
  process.env.RESTORE = "1";
  process.env.RESTORE_TO_TEST = "1";
  process.env.BACKUP_DB = dbBackup;
  process.env.BACKUP_UPLOADS = "";

  require("../src/scripts/backup-restore.js");

  await sqlite.openDb();
  const after = await sqlite.get("SELECT COUNT(*) as n FROM issues");
  await sqlite.closeDb();

  expect(after.n).toBe(before.n);

  const integrity = await integrityCheck();
  expect(integrity.ok).toBe(true);
  expect(integrity.result).toBe("ok");
});
