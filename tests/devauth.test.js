"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");
const request = require("supertest");

const TEST_DIR = path.join(os.tmpdir(), `gestor-tareas-devauth-test-${Date.now()}`);
fs.mkdirSync(TEST_DIR, { recursive: true });

process.env.DB_FILE = path.join(TEST_DIR, "test.db");
process.env.UPLOAD_DIR = path.join(TEST_DIR, "uploads");
process.env.PINO_LOG_LEVEL = "silent";
delete process.env.API_KEY;

const app = require("../src/app");
const { migrate, closeDb } = require("../src/db/sqlite");
const { devAuthBypassEnabled } = require("../src/config/devAuth");

beforeAll(async () => {
  await migrate();
});

afterAll(async () => {
  await closeDb();
  fs.rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("devAuthBypassEnabled", () => {
  test("exige DEV_AUTH_BYPASS=1, NODE_ENV=development y ninguna API_KEY", () => {
    expect(devAuthBypassEnabled({ DEV_AUTH_BYPASS: "1", NODE_ENV: "development" })).toBe(true);
    expect(devAuthBypassEnabled({ NODE_ENV: "development" })).toBe(false);
    expect(devAuthBypassEnabled({ DEV_AUTH_BYPASS: "1", NODE_ENV: "development", API_KEY: "k" })).toBe(false);
    for (const nodeEnv of [undefined, "", "prod", "Production", "production", "test", "staging"]) {
      expect(devAuthBypassEnabled({ DEV_AUTH_BYPASS: "1", NODE_ENV: nodeEnv })).toBe(false);
    }
  });
});

describe("Peticiones sin credenciales", () => {
  const original = process.env.NODE_ENV;
  afterEach(() => {
    process.env.NODE_ENV = original;
    delete process.env.DEV_AUTH_BYPASS;
  });

  test.each([undefined, "prod", "staging", "development"])(
    "NODE_ENV=%s sin DEV_AUTH_BYPASS -> 401",
    async (nodeEnv) => {
      if (nodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = nodeEnv;
      const res = await request(app).get("/v1/users");
      expect(res.statusCode).toBe(401);
    }
  );

  test("NODE_ENV=development con DEV_AUTH_BYPASS=1 -> entra como admin (y avisa)", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    process.env.NODE_ENV = "development";
    process.env.DEV_AUTH_BYPASS = "1";
    const res = await request(app).get("/v1/users");
    expect(res.statusCode).toBe(200);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
