"use strict";

// Contrato de src/db/sqlite.js: el comportamiento que el resto de la app
// espera del módulo, independiente del driver (antes `sqlite3`, ahora
// `node:sqlite`).
const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawn } = require("child_process");

const TEST_DIR = path.join(os.tmpdir(), `gestor-tareas-sqlite-wrapper-${Date.now()}`);
fs.mkdirSync(TEST_DIR, { recursive: true });
process.env.DB_FILE = path.join(TEST_DIR, "wrapper.db");

const sqlite = require("../src/db/sqlite");
const { run, get, all, closeDb, integrityCheck } = sqlite;

beforeAll(async () => {
  await run("CREATE TABLE t (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, flag INTEGER, note TEXT)");
});

afterAll(async () => {
  await closeDb();
  fs.rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("run / get / all", () => {
  test("run devuelve lastID y changes numéricos", async () => {
    const res = await run("INSERT INTO t (name, flag) VALUES (?, ?)", ["a", 1]);
    expect(res).toEqual({ changes: 1, lastID: expect.any(Number) });
    expect(res.lastID).toBeGreaterThan(0);
  });

  test("get devuelve un objeto normal, o null si no hay fila", async () => {
    const row = await get("SELECT name, flag FROM t WHERE name = ?", ["a"]);
    expect(row).toEqual({ name: "a", flag: 1 });
    expect(Object.getPrototypeOf(row)).toBe(Object.prototype);
    expect(await get("SELECT * FROM t WHERE name = ?", ["no-existe"])).toBeNull();
  });

  test("all devuelve un array de objetos normales", async () => {
    const rows = await all("SELECT name FROM t ORDER BY id");
    expect(Array.isArray(rows)).toBe(true);
    expect(Object.getPrototypeOf(rows[0])).toBe(Object.prototype);
    expect(await all("SELECT * FROM t WHERE 0")).toEqual([]);
  });

  test("undefined se guarda como NULL y los booleanos como 1/0", async () => {
    await run("INSERT INTO t (name, flag, note) VALUES (?, ?, ?)", ["b", true, undefined]);
    await run("INSERT INTO t (name, flag) VALUES (?, ?)", ["c", false]);
    expect(await get("SELECT flag, note FROM t WHERE name = ?", ["b"])).toEqual({ flag: 1, note: null });
    expect(await get("SELECT flag FROM t WHERE name = ?", ["c"])).toEqual({ flag: 0 });
  });

  test("violación de UNIQUE -> rechazo con code SQLITE_CONSTRAINT", async () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    await expect(run("INSERT INTO t (name) VALUES (?)", ["a"])).rejects.toMatchObject({
      code: "SQLITE_CONSTRAINT",
      message: expect.stringContaining("UNIQUE"),
    });
    spy.mockRestore();
  });

  test("transacciones con BEGIN / ROLLBACK (patrón de config.service)", async () => {
    await run("BEGIN TRANSACTION");
    await run("INSERT INTO t (name) VALUES (?)", ["tx"]);
    await run("ROLLBACK");
    expect(await get("SELECT * FROM t WHERE name = ?", ["tx"])).toBeNull();
  });

  test("integrityCheck en una BD sana", async () => {
    expect(await integrityCheck()).toEqual({ ok: true, result: "ok" });
  });

  test("las claves foráneas están activas", async () => {
    expect(await get("PRAGMA foreign_keys")).toEqual({ foreign_keys: 1 });
  });
});

describe("apertura", () => {
  test("espera si otro proceso tiene la BD bloqueada (en vez de 'database is locked')", async () => {
    await closeDb();
    const lockedFile = path.join(TEST_DIR, "locked.db");

    // Otro proceso abre la BD, toma un bloqueo exclusivo y lo suelta a los 400 ms.
    const holder = spawn(process.execPath, ["--no-warnings", "-e", `
      const { DatabaseSync } = require("node:sqlite");
      const d = new DatabaseSync(${JSON.stringify(lockedFile)});
      d.exec("CREATE TABLE IF NOT EXISTS x (a); BEGIN EXCLUSIVE; INSERT INTO x VALUES (1);");
      process.stdout.write("locked\\n");
      setTimeout(() => { d.exec("COMMIT"); d.close(); }, 400);
    `]);
    await new Promise((resolve, reject) => {
      holder.stdout.on("data", (b) => b.toString().includes("locked") && resolve());
      holder.on("error", reject);
    });

    let isolated;
    jest.isolateModules(() => {
      process.env.DB_FILE = lockedFile;
      isolated = require("../src/db/sqlite");
    });
    await expect(isolated.openDb()).resolves.toBeDefined();
    expect(await isolated.get("SELECT COUNT(*) AS n FROM x")).toEqual({ n: 1 });
    await isolated.closeDb();
    await new Promise((resolve) => holder.on("exit", resolve));
  });

  test("un fichero que no es una BD -> error con code de corrupción y aviso", async () => {
    const badFile = path.join(TEST_DIR, "bad.db");
    fs.writeFileSync(badFile, "esto no es una base de datos SQLite, solo texto de relleno ".repeat(20));

    let isolated;
    jest.isolateModules(() => {
      process.env.DB_FILE = badFile;
      isolated = require("../src/db/sqlite");
    });
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    await expect(isolated.openDb()).rejects.toMatchObject({ code: expect.stringMatching(/^SQLITE_(NOTADB|CORRUPT)$/) });
    expect(spy.mock.calls.some((c) => String(c[0]).includes("CORRUPTION DETECTED"))).toBe(true);
    spy.mockRestore();
  });
});
