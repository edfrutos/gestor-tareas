"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");
const request = require("supertest");
const bcrypt = require("bcryptjs");

const TEST_DIR = path.join(os.tmpdir(), `gestor-tareas-pwpolicy-test-${Date.now()}`);
fs.mkdirSync(TEST_DIR, { recursive: true });

process.env.DB_FILE = path.join(TEST_DIR, "test.db");
process.env.UPLOAD_DIR = path.join(TEST_DIR, "uploads");
process.env.JWT_SECRET = "test-jwt-secret";
process.env.API_KEY = "test-secret";
process.env.PINO_LOG_LEVEL = "silent";

const app = require("../src/app");
const { migrate, closeDb, run } = require("../src/db/sqlite");

beforeAll(async () => {
  await migrate();
});

afterAll(async () => {
  await closeDb();
  fs.rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("Mínimo de 8 caracteres en contraseñas nuevas", () => {
  test("registro con 7 caracteres: 400 con mensaje en español", async () => {
    const res = await request(app).post("/v1/auth/register").send({ username: "pw_short", password: "1234567" });
    expect(res.statusCode).toBe(400);
    expect(JSON.stringify(res.body)).toContain("al menos 8 caracteres");
  });

  test("registro con 8 caracteres: 201", async () => {
    const res = await request(app).post("/v1/auth/register").send({ username: "pw_ok", password: "12345678" });
    expect(res.statusCode).toBe(201);
  });

  test("una contraseña antigua de 6 caracteres sigue sirviendo para entrar", async () => {
    const hash = await bcrypt.hash("abc123", 10);
    await run(
      "INSERT INTO users (username, password_hash, role, created_at) VALUES (?, ?, 'user', ?)",
      ["pw_legacy", hash, new Date().toISOString()]
    );
    const res = await request(app).post("/v1/auth/login").send({ username: "pw_legacy", password: "abc123" });
    expect(res.statusCode).toBe(200);

    // ...pero no puede cambiarla por otra corta
    const change = await request(app)
      .patch("/v1/auth/me/password")
      .set("Authorization", `Bearer ${res.body.token}`)
      .send({ currentPassword: "abc123", newPassword: "xyz789" });
    expect(change.statusCode).toBe(400);
  });

  test("alta y cambio de contraseña por un admin exigen 8", async () => {
    const create = await request(app)
      .post("/v1/users")
      .set("x-api-key", process.env.API_KEY)
      .send({ username: "pw_admin_new", password: "1234567" });
    expect(create.statusCode).toBe(400);

    const created = await request(app)
      .post("/v1/users")
      .set("x-api-key", process.env.API_KEY)
      .send({ username: "pw_admin_new", password: "12345678" });
    expect(created.statusCode).toBe(201);

    const patch = await request(app)
      .patch(`/v1/users/${created.body.id}`)
      .set("x-api-key", process.env.API_KEY)
      .send({ password: "corta" });
    expect(patch.statusCode).toBe(400);
  });
});
