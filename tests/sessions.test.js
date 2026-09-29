"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const request = require("supertest");
const { io: Client } = require("socket.io-client");

// Sesiones JWT contrastadas con la BD (session.service.js): el rol sale de la
// BD y los tokens se revocan al cambiar/restablecer la contraseña o el rol.
const TEST_DIR = path.join(os.tmpdir(), `gestor-tareas-sessions-test-${Date.now()}`);
fs.mkdirSync(TEST_DIR, { recursive: true });

process.env.DB_FILE = path.join(TEST_DIR, "test.db");
process.env.UPLOAD_DIR = path.join(TEST_DIR, "uploads");
process.env.JWT_SECRET = "test-jwt-secret";
process.env.PINO_LOG_LEVEL = "silent";

// El token de reset solo viaja en claro en el correo: lo capturamos ahí.
jest.mock("../src/services/mail.service", () => ({
  ...jest.requireActual("../src/services/mail.service"),
  notifyPasswordReset: jest.fn(async () => {}),
}));
const { notifyPasswordReset } = require("../src/services/mail.service");

const app = require("../src/app");
const { migrate, closeDb, run, get } = require("../src/db/sqlite");
const { initSocket } = require("../src/services/socket.service");
const { signToken } = require("../src/config/secrets");

let adminToken;

async function createUser(username, { admin = false } = {}) {
  const reg = await request(app)
    .post("/v1/auth/register")
    .send({ username, password: "password123", email: `${username}@test.com` });
  expect(reg.statusCode).toBe(201);
  if (admin) await run("UPDATE users SET role = 'admin' WHERE id = ?", [reg.body.id]);
  const login = await request(app).post("/v1/auth/login").send({ username, password: "password123" });
  expect(login.statusCode).toBe(200);
  return { id: reg.body.id, token: login.body.token };
}

const me = (token) => request(app).get("/v1/auth/me").set("Authorization", `Bearer ${token}`);

beforeAll(async () => {
  await migrate();
  adminToken = (await createUser("s_admin", { admin: true })).token;
});

afterAll(async () => {
  await closeDb();
  fs.rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("Revocación de sesiones", () => {
  test("cambiar la propia contraseña revoca las demás sesiones y devuelve un token nuevo", async () => {
    const { token: otherSession } = await createUser("s_self");
    const login = await request(app).post("/v1/auth/login").send({ username: "s_self", password: "password123" });
    const current = login.body.token;

    const res = await request(app)
      .patch("/v1/auth/me/password")
      .set("Authorization", `Bearer ${current}`)
      .send({ currentPassword: "password123", newPassword: "nueva-clave-1" });
    expect(res.statusCode).toBe(200);
    expect(res.body.token).toBeTruthy();

    expect((await me(otherSession)).statusCode).toBe(401);
    expect((await me(current)).statusCode).toBe(401);
    expect((await me(res.body.token)).statusCode).toBe(200);
  });

  test("PATCH /v1/auth/me con nueva contraseña también revoca y reemite", async () => {
    const { token } = await createUser("s_profile");
    const res = await request(app)
      .patch("/v1/auth/me")
      .set("Authorization", `Bearer ${token}`)
      .send({ currentPassword: "password123", newPassword: "nueva-clave-2" });
    expect(res.statusCode).toBe(200);
    expect((await me(token)).statusCode).toBe(401);
    expect((await me(res.body.token)).statusCode).toBe(200);
  });

  test("PATCH /v1/auth/me solo con email no revoca nada", async () => {
    const { token } = await createUser("s_email");
    const res = await request(app)
      .patch("/v1/auth/me")
      .set("Authorization", `Bearer ${token}`)
      .send({ email: "s_email_nuevo@test.com" });
    expect(res.statusCode).toBe(200);
    expect(res.body.token).toBeUndefined();
    expect((await me(token)).statusCode).toBe(200);
  });

  test("restablecer la contraseña revoca las sesiones abiertas", async () => {
    const { id, token } = await createUser("s_reset");
    await request(app).post("/v1/auth/forgot-password").send({ email: "s_reset@test.com" }).expect(200);
    const resetToken = notifyPasswordReset.mock.calls.at(-1)[1];

    // En la BD solo está el hash: el valor guardado no sirve como token.
    const { token: stored } = await get("SELECT token FROM password_resets WHERE user_id = ?", [id]);
    expect(stored).not.toBe(resetToken);
    await request(app)
      .post("/v1/auth/reset-password")
      .send({ token: stored, password: "no-deberia-valer" })
      .expect(400);

    await request(app)
      .post("/v1/auth/reset-password")
      .send({ token: resetToken, password: "nueva-clave-3" })
      .expect(200);
    expect((await me(token)).statusCode).toBe(401);
  });

  test("un admin degradado pierde el acceso de admin al instante", async () => {
    const { id, token } = await createUser("s_demoted", { admin: true });
    await request(app).get("/v1/users").set("Authorization", `Bearer ${token}`).expect(200);

    await request(app)
      .patch(`/v1/users/${id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ role: "user" })
      .expect(200);

    const res = await request(app).get("/v1/users").set("Authorization", `Bearer ${token}`);
    expect([401, 403]).toContain(res.statusCode);
  });

  test("el rol se lee de la BD aunque el token diga otra cosa", async () => {
    const { id } = await createUser("s_role");
    await run("UPDATE users SET role = 'user' WHERE id = ?", [id]);
    const forged = signToken({ id, username: "s_role", role: "admin", tv: 0 });
    const res = await request(app).get("/v1/users").set("Authorization", `Bearer ${forged}`);
    expect(res.statusCode).toBe(403);
  });

  test("el token de un usuario borrado deja de valer", async () => {
    const { id, token } = await createUser("s_deleted");
    await request(app).delete(`/v1/users/${id}`).set("Authorization", `Bearer ${adminToken}`).expect(200);
    expect((await me(token)).statusCode).toBe(401);
  });

  test("los tokens emitidos antes de token_version (sin `tv`) siguen valiendo", async () => {
    const { id } = await createUser("s_legacy");
    const legacy = signToken({ id, username: "s_legacy", role: "user" }, { expiresIn: "1h" });
    expect((await me(legacy)).statusCode).toBe(200);
  });
});

describe("Revocación en sockets", () => {
  let httpServer;
  let port;

  beforeAll((done) => {
    httpServer = http.createServer(app);
    initSocket(httpServer);
    httpServer.listen(() => {
      port = httpServer.address().port;
      done();
    });
  });

  afterAll((done) => {
    httpServer.close(() => done());
  });

  function connect(token) {
    return new Promise((resolve) => {
      const client = Client(`http://localhost:${port}`, {
        transports: ["websocket"],
        reconnection: false,
        auth: { token },
      });
      client.once("connect", () => resolve({ client, ok: true }));
      client.once("connect_error", () => resolve({ client, ok: false }));
    });
  }

  test("al revocar se cierra el socket abierto y el token viejo ya no conecta", async () => {
    const { id, token } = await createUser("s_socket");
    const { client, ok } = await connect(token);
    expect(ok).toBe(true);

    const closed = new Promise((resolve) => client.once("disconnect", resolve));
    await request(app)
      .patch(`/v1/users/${id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ password: "puesta-por-admin" })
      .expect(200);
    expect(await closed).toBe("io server disconnect");

    const again = await connect(token);
    expect(again.ok).toBe(false);
    again.client.close();
  });
});
