const request = require("supertest");
const fs = require("fs");
const path = require("path");
const os = require("os");

const TEST_DIR = path.join(os.tmpdir(), `gestor-tareas-contact-test-${Date.now()}`);
fs.mkdirSync(TEST_DIR, { recursive: true });

process.env.DB_FILE = path.join(TEST_DIR, "test.db");
process.env.UPLOAD_DIR = path.join(TEST_DIR, "uploads");
process.env.JWT_SECRET = "test-jwt-secret";
process.env.PINO_LOG_LEVEL = "silent";
process.env.CONTACT_RATE_LIMIT_MAX = "6";

const app = require("../src/app");
const { migrate, closeDb, get, all } = require("../src/db/sqlite");

const valid = {
  name: "Ana Pérez",
  email: "ana@example.com",
  subject: "No puedo subir fotos",
  message: "Al adjuntar una foto a una tarea me sale un error.",
  source: "web",
};

beforeAll(async () => {
  await migrate();
});

afterAll(async () => {
  await closeDb();
  fs.rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("POST /v1/contact", () => {
  test("acepta un mensaje sin sesión y lo guarda", async () => {
    const res = await request(app).post("/v1/contact").send(valid);
    expect(res.statusCode).toBe(201);
    expect(res.body.ok).toBe(true);

    const row = await get("SELECT * FROM contact_messages WHERE email = ?", [valid.email]);
    expect(row).toBeTruthy();
    expect(row.user_id).toBeNull();
    expect(row.subject).toBe(valid.subject);
    expect(row.source).toBe("web");
  });

  test("con JWT válido asocia el mensaje al usuario", async () => {
    await request(app).post("/v1/auth/register").send({ username: "contactuser", password: "password123" });
    const login = await request(app).post("/v1/auth/login").send({ username: "contactuser", password: "password123" });
    const token = login.body.token;

    const res = await request(app)
      .post("/v1/contact")
      .set("Authorization", `Bearer ${token}`)
      .send({ ...valid, email: "logged@example.com", source: "macos" });
    expect(res.statusCode).toBe(201);

    const row = await get("SELECT * FROM contact_messages WHERE email = ?", ["logged@example.com"]);
    expect(row.user_id).toBe(login.body.user.id);
  });

  test("rechaza datos inválidos", async () => {
    const res = await request(app).post("/v1/contact").send({ ...valid, email: "no-es-email", message: "corto" });
    expect(res.statusCode).toBe(400);
    // Formato Zod que esperan los clientes: [{ path, message }, ...]
    expect(Array.isArray(res.body.error)).toBe(true);
    expect(res.body.error.map((x) => x.path[0])).toEqual(expect.arrayContaining(["email", "message"]));
  });

  test("rechaza saltos de línea en el asunto (inyección de cabeceras)", async () => {
    const res = await request(app).post("/v1/contact").send({ ...valid, subject: "Hola\r\nBcc: x@evil.com" });
    expect(res.statusCode).toBe(400);
  });

  test("honeypot relleno: responde 201 pero no guarda", async () => {
    const res = await request(app).post("/v1/contact").send({ ...valid, email: "bot@example.com", website: "http://spam" });
    expect(res.statusCode).toBe(201);
    const rows = await all("SELECT * FROM contact_messages WHERE email = ?", ["bot@example.com"]);
    expect(rows).toHaveLength(0);
  });

  test("aplica rate limit por IP", async () => {
    // 5 peticiones previas en este fichero; el límite es 6.
    const first = await request(app).post("/v1/contact").send(valid);
    expect(first.statusCode).toBe(201);
    const limited = await request(app).post("/v1/contact").send(valid);
    expect(limited.statusCode).toBe(429);
  });
});
