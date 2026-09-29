"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");
const request = require("supertest");
const sharp = require("sharp");

// Miniaturas con imágenes reales (el resto de tests de subidas usa bytes de
// relleno y no ejercita sharp). Sirve de regresión al actualizar sharp/libvips.
const TEST_DIR = path.join(os.tmpdir(), `gestor-tareas-thumbs-test-${Date.now()}`);
const UPLOAD_DIR = path.join(TEST_DIR, "uploads");
const THUMBS_DIR = path.join(UPLOAD_DIR, "thumbs");
fs.mkdirSync(THUMBS_DIR, { recursive: true });

process.env.DB_FILE = path.join(TEST_DIR, "test.db");
process.env.UPLOAD_DIR = UPLOAD_DIR;
process.env.API_KEY = "test-secret";
process.env.PINO_LOG_LEVEL = "silent";

const app = require("../src/app");
const { migrate, closeDb } = require("../src/db/sqlite");

function makeImage(format, width = 800, height = 600) {
  return sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 60, b: 40 } },
  })[format]().toBuffer();
}

async function expectWebpThumb(thumbUrl, { width, height }) {
  const file = path.join(THUMBS_DIR, path.basename(thumbUrl));
  expect(fs.existsSync(file)).toBe(true);
  const meta = await sharp(file).metadata();
  expect(meta.format).toBe("webp");
  expect(meta.width).toBe(width);
  expect(meta.height).toBe(height);
}

beforeAll(async () => {
  await migrate();
});

afterAll(async () => {
  await closeDb();
  fs.rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("Miniaturas con sharp", () => {
  test.each(["jpeg", "png", "webp"])("foto de tarea %s -> miniatura webp 256x256", async (format) => {
    const res = await request(app)
      .post("/v1/issues")
      .set("x-api-key", process.env.API_KEY)
      .field("title", `Thumb ${format}`)
      .field("category", "test")
      .field("description", "Miniatura real")
      .field("lat", 40)
      .field("lng", -3)
      .attach("photo", await makeImage(format), { filename: `foto.${format}`, contentType: `image/${format}` });
    expect(res.statusCode).toBe(201);
    await expectWebpThumb(res.body.thumb_url, { width: 256, height: 256 });
  });

  test("plano -> miniatura webp 300x200", async () => {
    const res = await request(app)
      .post("/v1/maps")
      .set("x-api-key", process.env.API_KEY)
      .field("name", "Plano de prueba")
      .attach("map", await makeImage("png", 1200, 900), { filename: "plano.png", contentType: "image/png" });
    expect(res.statusCode).toBe(201);
    await expectWebpThumb(res.body.thumb_url, { width: 300, height: 200 });
  });

  test("avatar -> miniatura webp 256x256", async () => {
    const res = await request(app)
      .post("/v1/auth/me/avatar")
      .set("x-api-key", process.env.API_KEY)
      .attach("avatar", await makeImage("jpeg", 400, 400), { filename: "yo.jpg", contentType: "image/jpeg" });
    expect(res.statusCode).toBe(200);
    await expectWebpThumb(res.body.avatar_thumb_url, { width: 256, height: 256 });
  });
});
