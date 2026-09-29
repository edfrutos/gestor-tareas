const request = require("supertest");
const fs = require("fs");
const path = require("path");
const os = require("os");

// Comentarios: solo quien puede ver la tarea (admin, creador o asignado)
// puede leerlos o escribir en ella.
const TEST_DIR = path.join(os.tmpdir(), `gestor-tareas-comments-test-${Date.now()}`);
fs.mkdirSync(TEST_DIR, { recursive: true });

process.env.DB_FILE = path.join(TEST_DIR, "test.db");
process.env.UPLOAD_DIR = path.join(TEST_DIR, "uploads");
process.env.JWT_SECRET = "test-jwt-secret";
process.env.PINO_LOG_LEVEL = "silent";

const app = require("../src/app");
const { migrate, closeDb, run, all } = require("../src/db/sqlite");

const tokens = {};
let issueId;

async function registerAndLogin(username) {
  const reg = await request(app).post("/v1/auth/register").send({ username, password: "password123" });
  expect(reg.statusCode).toBe(201);
  if (username === "c_admin") await run("UPDATE users SET role = 'admin' WHERE username = ?", [username]);
  const login = await request(app).post("/v1/auth/login").send({ username, password: "password123" });
  expect(login.statusCode).toBe(200);
  return { token: login.body.token, id: reg.body.id };
}

beforeAll(async () => {
  await migrate();
  const admin = await registerAndLogin("c_admin");
  const creator = await registerAndLogin("c_creator");
  const assignee = await registerAndLogin("c_assignee");
  const outsider = await registerAndLogin("c_outsider");
  Object.assign(tokens, {
    admin: admin.token,
    creator: creator.token,
    assignee: assignee.token,
    outsider: outsider.token,
  });

  const res = await request(app)
    .post("/v1/issues")
    .set("Authorization", `Bearer ${tokens.creator}`)
    .field("title", "Tarea privada")
    .field("category", "test")
    .field("description", "Solo para creador y asignado")
    .field("lat", 40)
    .field("lng", -3)
    .field("assigned_to", assignee.id);
  expect(res.statusCode).toBe(201);
  issueId = res.body.id;

  await request(app)
    .post(`/v1/issues/${issueId}/comments`)
    .set("Authorization", `Bearer ${tokens.creator}`)
    .send({ text: "Comentario interno" })
    .expect(201);
});

afterAll(async () => {
  await closeDb();
  fs.rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("GET /v1/issues/:id/comments", () => {
  test("sin sesión: 401", async () => {
    const res = await request(app).get(`/v1/issues/${issueId}/comments`);
    expect(res.statusCode).toBe(401);
  });

  test("usuario sin relación con la tarea: 403 y sin comentarios", async () => {
    const res = await request(app)
      .get(`/v1/issues/${issueId}/comments`)
      .set("Authorization", `Bearer ${tokens.outsider}`);
    expect(res.statusCode).toBe(403);
    expect(JSON.stringify(res.body)).not.toContain("Comentario interno");
  });

  test.each(["creator", "assignee", "admin"])("%s puede leerlos", async (who) => {
    const res = await request(app)
      .get(`/v1/issues/${issueId}/comments`)
      .set("Authorization", `Bearer ${tokens[who]}`);
    expect(res.statusCode).toBe(200);
    expect(res.body[0].text).toBe("Comentario interno");
  });

  test("tarea inexistente: 404", async () => {
    const res = await request(app)
      .get("/v1/issues/999999/comments")
      .set("Authorization", `Bearer ${tokens.admin}`);
    expect(res.statusCode).toBe(404);
  });
});

describe("POST /v1/issues/:id/comments", () => {
  test("usuario sin relación con la tarea: 403 y no se guarda", async () => {
    const res = await request(app)
      .post(`/v1/issues/${issueId}/comments`)
      .set("Authorization", `Bearer ${tokens.outsider}`)
      .send({ text: "Intruso" });
    expect(res.statusCode).toBe(403);
    const rows = await all("SELECT id FROM issue_comments WHERE text = ?", ["Intruso"]);
    expect(rows).toHaveLength(0);
  });

  test("el asignado puede responder", async () => {
    const res = await request(app)
      .post(`/v1/issues/${issueId}/comments`)
      .set("Authorization", `Bearer ${tokens.assignee}`)
      .send({ text: "Respuesta del asignado" });
    expect(res.statusCode).toBe(201);
  });
});
