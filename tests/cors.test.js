"use strict";

const http = require("http");
const request = require("supertest");
const { makeOriginChecker } = require("../src/config/cors");

const check = (env, origin) =>
  new Promise((resolve) => makeOriginChecker(env)(origin, (_e, ok) => resolve(ok)));

describe("makeOriginChecker", () => {
  test("sin Origin (mismo origen, macOS, curl): permitido", async () => {
    expect(await check({ NODE_ENV: "production" }, undefined)).toBe(true);
  });

  test("con ALLOWED_ORIGINS solo se aceptan esos", async () => {
    const env = { NODE_ENV: "production", ALLOWED_ORIGINS: "https://gtareas.example.com, https://otra.example.com" };
    expect(await check(env, "https://gtareas.example.com")).toBe(true);
    expect(await check(env, "https://otra.example.com")).toBe(true);
    expect(await check(env, "https://evil.example.net")).toBe(false);
  });

  test("sin ALLOWED_ORIGINS: localhost fuera de producción, nada en producción", async () => {
    expect(await check({ NODE_ENV: "development" }, "http://localhost:3000")).toBe(true);
    expect(await check({ NODE_ENV: "development" }, "https://evil.example.net")).toBe(false);
    expect(await check({ NODE_ENV: "production" }, "http://localhost:3000")).toBe(false);
  });
});

describe("Socket.io aplica la misma regla", () => {
  let server;

  beforeAll((done) => {
    process.env.ALLOWED_ORIGINS = "https://gtareas.example.com";
    jest.isolateModules(() => {
      const app = require("../src/app");
      const { initSocket } = require("../src/services/socket.service");
      server = http.createServer(app);
      initSocket(server);
    });
    server.listen(done);
  });

  afterAll((done) => {
    delete process.env.ALLOWED_ORIGINS;
    server.close(() => done());
  });

  const handshake = (origin) =>
    request(server).get("/socket.io/?EIO=4&transport=polling").set("Origin", origin);

  test("origen permitido: recibe Access-Control-Allow-Origin", async () => {
    const res = await handshake("https://gtareas.example.com");
    expect(res.headers["access-control-allow-origin"]).toBe("https://gtareas.example.com");
  });

  test("origen ajeno: sin Access-Control-Allow-Origin (antes era \"*\")", async () => {
    const res = await handshake("https://evil.example.net");
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });
});
