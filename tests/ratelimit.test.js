"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");
const request = require("supertest");

// Limitadores de /auth (siempre activos) y trust proxy. Cada test usa su
// propia IP vía X-Forwarded-For para no compartir contadores.
const TEST_DIR = path.join(os.tmpdir(), `gestor-tareas-ratelimit-test-${Date.now()}`);
fs.mkdirSync(TEST_DIR, { recursive: true });

process.env.DB_FILE = path.join(TEST_DIR, "test.db");
process.env.UPLOAD_DIR = path.join(TEST_DIR, "uploads");
process.env.JWT_SECRET = "test-jwt-secret";
process.env.PINO_LOG_LEVEL = "silent";
delete process.env.TRUST_PROXY;

const app = require("../src/app");
const { migrate, closeDb } = require("../src/db/sqlite");
const { parseTrustProxy } = require("../src/config/trustProxy");

beforeAll(async () => {
  await migrate();
  await request(app).post("/v1/auth/register").send({ username: "rl_user", password: "password123" }).expect(201);
});

afterAll(async () => {
  await closeDb();
  fs.rmSync(TEST_DIR, { recursive: true, force: true });
});

const login = (ip, password, base = "/v1") =>
  request(app).post(`${base}/auth/login`).set("X-Forwarded-For", ip).send({ username: "rl_user", password });

describe("parseTrustProxy", () => {
  test("interpreta los valores de TRUST_PROXY", () => {
    expect(parseTrustProxy(undefined)).toBe(1);
    expect(parseTrustProxy("")).toBe(1);
    expect(parseTrustProxy("0")).toBe(false);
    expect(parseTrustProxy("false")).toBe(false);
    expect(parseTrustProxy("2")).toBe(2);
    expect(parseTrustProxy("loopback, 172.17.0.0/16")).toBe("loopback, 172.17.0.0/16");
  });
});

describe("Límite de intentos fallidos en /auth", () => {
  test("tras 10 contraseñas incorrectas, la IP recibe 429 (incluso con la correcta)", async () => {
    const ip = "203.0.113.10";
    for (let i = 0; i < 10; i++) {
      expect((await login(ip, "incorrecta")).statusCode).toBe(401);
    }
    expect((await login(ip, "incorrecta")).statusCode).toBe(429);
    expect((await login(ip, "password123")).statusCode).toBe(429);
  });

  test("los logins correctos no consumen el cupo", async () => {
    const ip = "203.0.113.20";
    for (let i = 0; i < 15; i++) {
      expect((await login(ip, "password123")).statusCode).toBe(200);
    }
    expect((await login(ip, "incorrecta")).statusCode).toBe(401);
  });

  test("/v1/auth y /api/auth comparten contador", async () => {
    const ip = "203.0.113.30";
    for (let i = 0; i < 5; i++) await login(ip, "incorrecta", "/v1");
    for (let i = 0; i < 5; i++) await login(ip, "incorrecta", "/api");
    expect((await login(ip, "incorrecta", "/api")).statusCode).toBe(429);
  });

  test("otra IP (según X-Forwarded-For) tiene su propio contador", async () => {
    const blocked = "203.0.113.40";
    for (let i = 0; i < 11; i++) await login(blocked, "incorrecta");
    expect((await login(blocked, "password123")).statusCode).toBe(429);
    expect((await login("198.51.100.7", "password123")).statusCode).toBe(200);
  });
});

describe("Límite de /auth/forgot-password", () => {
  test("cuenta todas las peticiones: la sexta en una hora recibe 429", async () => {
    const ip = "203.0.113.50";
    for (let i = 0; i < 5; i++) {
      const res = await request(app)
        .post("/v1/auth/forgot-password")
        .set("X-Forwarded-For", ip)
        .send({ email: "nadie@example.com" });
      expect(res.statusCode).toBe(200);
    }
    const res = await request(app)
      .post("/v1/auth/forgot-password")
      .set("X-Forwarded-For", ip)
      .send({ email: "nadie@example.com" });
    expect(res.statusCode).toBe(429);
  });
});
