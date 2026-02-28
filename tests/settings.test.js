"use strict";

const request = require("supertest");
const app = require("../src/app");
const { openDb, closeDb, run, migrate } = require("../src/db/sqlite");

describe("Settings API", () => {
  let adminToken;
  let userToken;

  beforeAll(async () => {
    openDb();
    await migrate();
    // Limpiar y preparar usuarios
    await run("DELETE FROM users");
    await run("DELETE FROM settings");

    // Crear admin
    await request(app)
      .post("/v1/auth/register")
      .send({ username: "admin", password: "adminpassword", email: "admin@test.com" });
    await run("UPDATE users SET role = 'admin' WHERE username = 'admin'");
    
    const adminLogin = await request(app)
      .post("/v1/auth/login")
      .send({ username: "admin", password: "adminpassword" });
    adminToken = adminLogin.body.token;

    // Crear user normal
    await request(app)
      .post("/v1/auth/register")
      .send({ username: "user", password: "userpassword", email: "user@test.com" });
    
    const userLogin = await request(app)
      .post("/v1/auth/login")
      .send({ username: "user", password: "userpassword" });
    userToken = userLogin.body.token;
  });

  afterAll(async () => {
    await closeDb();
  });

  it("should deny access to settings for non-admin users", async () => {
    const res = await request(app)
      .get("/v1/settings")
      .set("Authorization", `Bearer ${userToken}`);
    
    expect(res.status).toBe(403);
  });

  it("should allow admin to get settings", async () => {
    const res = await request(app)
      .get("/v1/settings")
      .set("Authorization", `Bearer ${adminToken}`);
    
    expect(res.status).toBe(200);
    expect(res.body && typeof res.body === "object" && !Array.isArray(res.body)).toBe(true);
  });

  it("should allow admin to update settings", async () => {
    const updateRes = await request(app)
      .patch("/v1/settings")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ ADMIN_EMAIL: "newadmin@test.com" });
    
    expect(updateRes.status).toBe(200);
    
    // Verificar que se ha guardado
    const getRes = await request(app)
      .get("/v1/settings")
      .set("Authorization", `Bearer ${adminToken}`);
    
    expect(getRes.body.ADMIN_EMAIL).toBe("newadmin@test.com");
  });

  it("should return 400 for invalid payload", async () => {
    const res = await request(app)
      .patch("/v1/settings")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("Content-Type", "application/json")
      .send(123);
    
    expect(res.status).toBe(400);
  });
});
