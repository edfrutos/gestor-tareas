"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");
const express = require("express");
const request = require("supertest");
const { z } = require("zod");

const TEST_DIR = path.join(os.tmpdir(), `gestor-tareas-errors-test-${Date.now()}`);
fs.mkdirSync(path.join(TEST_DIR, "uploads", "thumbs"), { recursive: true });

process.env.DB_FILE = path.join(TEST_DIR, "test.db");
process.env.UPLOAD_DIR = path.join(TEST_DIR, "uploads");
process.env.API_KEY = "test-secret";
process.env.PINO_LOG_LEVEL = "silent";

const app = require("../src/app");
const errorHandler = require("../src/middleware/errorHandler");
const { migrate, closeDb } = require("../src/db/sqlite");

beforeAll(async () => {
  await migrate();
});

afterAll(async () => {
  await closeDb();
  fs.rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("errorHandler", () => {
  const mini = express();
  mini.get("/sqlite", () => {
    const err = new Error("SQLITE_ERROR: no such column: password_hash in SELECT * FROM users");
    err.code = "SQLITE_ERROR";
    throw err;
  });
  mini.get("/bad-request", () => {
    const err = new Error("Campo obligatorio");
    err.status = 400;
    throw err;
  });
  mini.get("/zod", () => {
    z.object({ username: z.string().min(3) }).parse({ username: "x" });
  });
  mini.get("/multer", () => {
    const err = new Error("File too large");
    err.name = "MulterError";
    err.code = "LIMIT_FILE_SIZE";
    throw err;
  });
  mini.use(errorHandler);

  test("los 500 no filtran el mensaje interno", async () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    const res = await request(mini).get("/sqlite");
    expect(res.statusCode).toBe(500);
    expect(res.body.error).toEqual({ message: "Internal Server Error", code: "internal_error", data: null });
    expect(JSON.stringify(res.body)).not.toMatch(/SQLITE|password_hash/);
    expect(spy).toHaveBeenCalled(); // el detalle sí va al log
    spy.mockRestore();
  });

  test("los 4xx conservan su mensaje", async () => {
    const res = await request(mini).get("/bad-request");
    expect(res.statusCode).toBe(400);
    expect(res.body.error.message).toBe("Campo obligatorio");
  });

  test("ZodError -> 400 validation_error", async () => {
    const res = await request(mini).get("/zod");
    expect(res.statusCode).toBe(400);
    expect(res.body.error.code).toBe("validation_error");
    expect(res.body.error.message).toMatch(/^username:/);
  });

  test("límite de tamaño de multer -> 413", async () => {
    const res = await request(mini).get("/multer");
    expect(res.statusCode).toBe(413);
  });
});

describe("Errores reales de la API", () => {
  test("POST /v1/photos con tipo no permitido -> 400 (antes 500)", async () => {
    const res = await request(app)
      .post("/v1/photos")
      .set("x-api-key", process.env.API_KEY)
      .attach("file", Buffer.from("hola"), { filename: "x.txt", contentType: "text/plain" });
    expect(res.statusCode).toBe(400);
    expect(res.body.error.code).toBe("unsupported_file_type");
  });

  test("POST /v1/users con datos no válidos -> 400 (antes 500)", async () => {
    const res = await request(app)
      .post("/v1/users")
      .set("x-api-key", process.env.API_KEY)
      .send({ username: "x", password: "1" });
    expect(res.statusCode).toBe(400);
    expect(res.body.error.code).toBe("validation_error");
  });

  test("GET /v1/config refleja el estado real de CSRF", async () => {
    process.env.CSRF_ENABLED = "1";
    try {
      const res = await request(app).get("/v1/config");
      expect(res.body.csrfEnabled).toBe(false);
    } finally {
      delete process.env.CSRF_ENABLED;
    }
  });
});
