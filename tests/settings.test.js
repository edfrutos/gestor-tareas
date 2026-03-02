"use strict";

const request = require("supertest");
const app = require("../src/app");
const { openDb, closeDb, run, migrate } = require("../src/db/sqlite");

describe("Settings API", () => {
  let adminToken;
  let userToken;

  beforeAll(async () => {
    await openDb();
    await migrate();
    
    const suffix = Math.random().toString(36).replace(/[^a-z0-9]/g, "").substring(0, 6);
    const adminUser = `admins${suffix}`;
    const normalUser = `users${suffix}`;
    const pass = "password";

    // Admin
    await request(app).post("/v1/auth/register").send({ 
      username: adminUser, 
      password: pass, 
      email: `${adminUser}@test.com` 
    });
    await run("UPDATE users SET role = 'admin' WHERE username = ?", [adminUser]);
    const resA = await request(app).post("/v1/auth/login").send({ username: adminUser, password: pass });
    adminToken = resA.body.token;

    // Normal User
    await request(app).post("/v1/auth/register").send({ 
      username: normalUser, 
      password: pass, 
      email: `${normalUser}@test.com` 
    });
    const resU = await request(app).post("/v1/auth/login").send({ username: normalUser, password: pass });
    userToken = resU.body.token;
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
  });

  it("should allow admin to update settings", async () => {
    const email = `test${Math.floor(Math.random()*1000)}@example.com`;
    const res = await request(app)
      .patch("/v1/settings")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ ADMIN_EMAIL: email });
    expect(res.status).toBe(200);
    
    const check = await request(app)
      .get("/v1/settings")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(check.body.ADMIN_EMAIL).toBe(email);
  });
});
