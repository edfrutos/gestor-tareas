const request = require("supertest");
const fs = require("fs");
const path = require("path");
const os = require("os");

const TEST_DIR = path.join(os.tmpdir(), `gestor-tareas-public-pages-test-${Date.now()}`);
fs.mkdirSync(TEST_DIR, { recursive: true });

process.env.DB_FILE = path.join(TEST_DIR, "test.db");
process.env.UPLOAD_DIR = path.join(TEST_DIR, "uploads");
process.env.JWT_SECRET = "test-jwt-secret";
process.env.PINO_LOG_LEVEL = "silent";

const app = require("../src/app");
const { closeDb } = require("../src/db/sqlite");

afterAll(async () => {
  await closeDb();
  fs.rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("privacidad y soporte redirigen a efjdev.com", () => {
  test.each([
    ["/privacy.html", "https://efjdev.com/privacidad/#gestortareas"],
    ["/privacy", "https://efjdev.com/privacidad/#gestortareas"],
    ["/support.html", "https://efjdev.com/soporte/#gestortareas"],
    ["/support", "https://efjdev.com/soporte/#gestortareas"],
  ])("%s → %s (301)", async (from, to) => {
    const res = await request(app).get(from);
    expect(res.status).toBe(301);
    expect(res.headers.location).toBe(to);
  });

  test("la query string no altera el destino", async () => {
    const res = await request(app).get("/privacy.html?ref=appstore");
    expect(res.status).toBe(301);
    expect(res.headers.location).toBe("https://efjdev.com/privacidad/#gestortareas");
  });
});
