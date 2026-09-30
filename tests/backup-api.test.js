"use strict";

// La copia de la BD debe ser consistente en caliente: en modo WAL, los
// cambios recientes están en el fichero -wal y una copia de fichero los
// perdería. backupDbToFile usa la Backup API de SQLite (node:sqlite).
const fs = require("fs");
const path = require("path");
const os = require("os");
const { DatabaseSync } = require("node:sqlite");

const TEST_DIR = path.join(os.tmpdir(), `gestor-tareas-backup-api-${Date.now()}`);
fs.mkdirSync(TEST_DIR, { recursive: true });
process.env.DB_FILE = path.join(TEST_DIR, "live.db");
delete process.env.SQLITE_JOURNAL_MODE; // WAL, como en producción

const { run, get, closeDb } = require("../src/db/sqlite");
const { backupDbToFile } = require("../src/cron/backup");

afterAll(async () => {
  await closeDb();
  fs.rmSync(TEST_DIR, { recursive: true, force: true });
});

test("la copia incluye los cambios que siguen en el fichero WAL", async () => {
  expect((await get("PRAGMA journal_mode")).journal_mode).toBe("wal");
  await run("CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)");
  for (let i = 0; i < 50; i++) await run("INSERT INTO t (v) VALUES (?)", [`fila ${i}`]);

  // Las filas siguen en -wal (sin checkpoint): el fichero principal no las tiene.
  const walFile = `${process.env.DB_FILE}-wal`;
  expect(fs.existsSync(walFile) && fs.statSync(walFile).size > 0).toBe(true);

  const dest = path.join(TEST_DIR, "copia.sqlite");
  await new Promise((resolve, reject) => backupDbToFile(process.env.DB_FILE, dest, (err) => (err ? reject(err) : resolve())));

  const copy = new DatabaseSync(dest, { readOnly: true });
  expect(copy.prepare("SELECT COUNT(*) AS n FROM t").get().n).toBe(50);
  expect(copy.prepare("PRAGMA integrity_check").get().integrity_check).toBe("ok");
  copy.close();
});
