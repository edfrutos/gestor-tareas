const request = require("supertest");
const fs = require("fs");
const path = require("path");
const os = require("os");

// Configuración de entorno para tests
const TEST_DIR = path.join(os.tmpdir(), `gestor-tareas-auth-test-${Date.now()}`);
fs.mkdirSync(TEST_DIR, { recursive: true });

process.env.DB_FILE = path.join(TEST_DIR, "test.db");
process.env.UPLOAD_DIR = path.join(TEST_DIR, "uploads");
process.env.JWT_SECRET = "test-jwt-secret";
process.env.PINO_LOG_LEVEL = "silent";

const app = require("../src/app");
const { migrate, closeDb } = require("../src/db/sqlite");

beforeAll(async () => {
  await migrate();
});

afterAll(async () => {
  await closeDb();
  fs.rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("Auth & RBAC Integration Tests", () => {
  let adminToken;
  let user1Token;
  let user2Token;
  let user1Id;
  let user2Id;
  let issue1Id;

  test("Register Admin and User", async () => {
    // Registro admin
    const resAdmin = await request(app)
      .post("/v1/auth/register")
      .send({ username: "testadmin", password: "password123", role: "admin" });
    expect(resAdmin.statusCode).toBe(201);

    // Registro user1
    const resUser1 = await request(app)
      .post("/v1/auth/register")
      .send({ username: "user1", password: "password123", role: "user" });
    expect(resUser1.statusCode).toBe(201);
    user1Id = resUser1.body.id;

    // Registro user2
    const resUser2 = await request(app)
      .post("/v1/auth/register")
      .send({ username: "user2", password: "password123", role: "user" });
    expect(resUser2.statusCode).toBe(201);
    user2Id = resUser2.body.id;
  });

  test("Login and obtain tokens", async () => {
    const loginAdmin = await request(app)
      .post("/v1/auth/login")
      .send({ username: "testadmin", password: "password123" });
    adminToken = loginAdmin.body.token;

    const loginUser1 = await request(app)
      .post("/v1/auth/login")
      .send({ username: "user1", password: "password123" });
    user1Token = loginUser1.body.token;

    const loginUser2 = await request(app)
      .post("/v1/auth/login")
      .send({ username: "user2", password: "password123" });
    user2Token = loginUser2.body.token;

    expect(adminToken).toBeDefined();
    expect(user1Token).toBeDefined();
  });

  test("RBAC: Only admin can list users", async () => {
    const resAdmin = await request(app)
      .get("/v1/users")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(resAdmin.statusCode).toBe(200);
    expect(resAdmin.body.items.length).toBeGreaterThanOrEqual(3);
    expect(resAdmin.body.total).toBeGreaterThanOrEqual(3);

    const resUser = await request(app)
      .get("/v1/users")
      .set("Authorization", `Bearer ${user1Token}`);
    expect(resUser.statusCode).toBe(403);
  });

  test("RBAC: Issues visibility", async () => {
    // User1 crea una issue
    const resCreate = await request(app)
      .post("/v1/issues")
      .set("Authorization", `Bearer ${user1Token}`)
      .send({
        title: "Tarea de User 1",
        category: "limpieza",
        description: "Bolsas acumuladas",
        lat: 40.4,
        lng: -3.7
      });
    expect(resCreate.statusCode).toBe(201);
    issue1Id = resCreate.body.id;

    // User 1 debe ver su issue
    const resUser1 = await request(app)
      .get("/v1/issues")
      .set("Authorization", `Bearer ${user1Token}`);
    expect(resUser1.body.items.some(i => i.id === issue1Id)).toBe(true);

    // User 2 NO debe ver la issue de User 1
    const resUser2 = await request(app)
      .get("/v1/issues")
      .set("Authorization", `Bearer ${user2Token}`);
    expect(resUser2.body.items.some(i => i.id === issue1Id)).toBe(false);

    // Admin debe ver todas las issues
    const resAdmin = await request(app)
      .get("/v1/issues")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(resAdmin.body.items.some(i => i.id === issue1Id)).toBe(true);
  });

  test("RBAC: Issues modification", async () => {
    // User 2 intenta editar la issue de User 1 -> 403
    const resUser2Edit = await request(app)
      .patch(`/v1/issues/${issue1Id}`)
      .set("Authorization", `Bearer ${user2Token}`)
      .send({ status: "in_progress" });
    expect(resUser2Edit.statusCode).toBe(403);

    // User 1 edita su propia issue -> 200
    const resUser1Edit = await request(app)
      .patch(`/v1/issues/${issue1Id}`)
      .set("Authorization", `Bearer ${user1Token}`)
      .send({ status: "in_progress" });
    expect(resUser1Edit.statusCode).toBe(200);

    // Admin edita la issue de User 1 -> 200
    const resAdminEdit = await request(app)
      .patch(`/v1/issues/${issue1Id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "resolved" });
    expect(resAdminEdit.statusCode).toBe(200);
  });

  test("RBAC: Issues deletion", async () => {
    // User 2 intenta borrar -> 403
    const resUser2Del = await request(app)
        .delete(`/v1/issues/${issue1Id}`)
        .set("Authorization", `Bearer ${user2Token}`);
    expect(resUser2Del.statusCode).toBe(403);

    // Admin borra -> 200
    const resAdminDel = await request(app)
        .delete(`/v1/issues/${issue1Id}`)
        .set("Authorization", `Bearer ${adminToken}`);
    expect(resAdminDel.statusCode).toBe(200);
  });

  test("User Management (Admin)", async () => {
    // Admin cambia rol de user2 a admin
    const resRole = await request(app)
        .patch(`/v1/users/${user2Id}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ role: "admin" });
    expect(resRole.statusCode).toBe(200);

    // Re-login user2 para obtener nuevo token con rol admin
    const loginUser2New = await request(app)
      .post("/v1/auth/login")
      .send({ username: "user2", password: "password123" });
    user2Token = loginUser2New.body.token;

    // Ahora user2 debería poder listar usuarios
    const resUser2List = await request(app)
        .get("/v1/users")
        .set("Authorization", `Bearer ${user2Token}`);
    expect(resUser2List.statusCode).toBe(200);

    // Admin borra a user1
    const resDel = await request(app)
        .delete(`/v1/users/${user1Id}`)
        .set("Authorization", `Bearer ${adminToken}`);
    expect(resDel.statusCode).toBe(200);

    // Verificar que ya no está
    const resListFinal = await request(app)
        .get("/v1/users")
        .set("Authorization", `Bearer ${adminToken}`);
    expect(resListFinal.body.items.some(u => u.id === user1Id)).toBe(false);
  });
});
