"use strict";

const request = require("supertest");
const app = require("../src/app");
const { openDb, closeDb, run, migrate, get } = require("../src/db/sqlite");

describe("Map Zones API", () => {
  let adminToken;
  let mapId = 1;

  beforeAll(async () => {
    await openDb();
    await migrate();
    
    // Alfanumérico corto y simple para evitar rechazos de Zod
    const rnd = Math.floor(Math.random() * 1000000);
    const adminUser = `admz${rnd}`;
    const adminEmail = `admz${rnd}@test.com`;
    const adminPass = "password123";

    // Registrar
    const regRes = await request(app)
      .post("/v1/auth/register")
      .send({ username: adminUser, password: adminPass, email: adminEmail });
    
    if (regRes.status !== 201) {
      console.error("Register failed in zones.test.js:", regRes.status, regRes.body);
    }

    // Escalar a admin
    await run("UPDATE users SET role = 'admin' WHERE username = ?", [adminUser]);
    
    // Login
    const loginRes = await request(app)
      .post("/v1/auth/login")
      .send({ username: adminUser, password: adminPass });
    
    adminToken = loginRes.body.token;

    // Asegurar mapa
    const m = await get("SELECT id FROM maps LIMIT 1");
    if (m) mapId = m.id;
  });

  afterAll(async () => {
    await closeDb();
  });

  test("POST /v1/maps/:mapId/zones creates a zone", async () => {
    const geojson = JSON.stringify({
      type: "Feature",
      geometry: { type: "Polygon", coordinates: [[[0,0],[0,10],[10,10],[10,0],[0,0]]] },
      properties: {}
    });

    const res = await request(app)
      .post(`/v1/maps/${mapId}/zones`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        name: "Test Zone",
        type: "polygon",
        geojson: geojson,
        color: "#ff0000"
      });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe("Test Zone");
  });

  test("GET /v1/maps/:mapId/zones returns list", async () => {
    const res = await request(app)
      .get(`/v1/maps/${mapId}/zones`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});
