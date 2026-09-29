const request = require("supertest");
const fs = require("fs");
const path = require("path");
const os = require("os");

// Subidas: la extensión la decide el servidor y /uploads sirve el contenido
// de usuarios con cabeceras restrictivas.
const TEST_DIR = path.join(os.tmpdir(), `gestor-tareas-uploads-sec-test-${Date.now()}`);
const UPLOAD_DIR = path.join(TEST_DIR, "uploads");
fs.mkdirSync(path.join(UPLOAD_DIR, "thumbs"), { recursive: true });

process.env.DB_FILE = path.join(TEST_DIR, "test.db");
process.env.UPLOAD_DIR = UPLOAD_DIR;
process.env.API_KEY = "test-secret";
process.env.PINO_LOG_LEVEL = "silent";

const app = require("../src/app");
const { migrate, closeDb } = require("../src/db/sqlite");
const { pickUploadExtension, IMAGE_TYPES, DOC_TYPES } = require("../src/config/uploadTypes");

const XSS = Buffer.from("<script>alert(document.domain)</script>");

beforeAll(async () => {
  await migrate();
});

afterAll(async () => {
  await closeDb();
  fs.rmSync(TEST_DIR, { recursive: true, force: true });
});

function createIssue() {
  return request(app)
    .post("/v1/issues")
    .set("x-api-key", process.env.API_KEY)
    .field("title", "Upload sec")
    .field("category", "test")
    .field("description", "Probando subidas")
    .field("lat", 40)
    .field("lng", -3);
}

describe("pickUploadExtension", () => {
  test("usa la extensión del MIME, no la del nombre original", () => {
    expect(pickUploadExtension({ originalname: "x.html", mimetype: "image/png" }, IMAGE_TYPES)).toBe(".png");
    expect(pickUploadExtension({ originalname: "x.html", mimetype: "text/plain" }, DOC_TYPES)).toBe(".txt");
  });

  test("conserva la extensión original si es coherente con el MIME", () => {
    expect(pickUploadExtension({ originalname: "foto.JPEG", mimetype: "image/jpeg" }, IMAGE_TYPES)).toBe(".jpeg");
    expect(pickUploadExtension({ originalname: "notas.md", mimetype: "text/plain" }, DOC_TYPES)).toBe(".md");
  });

  test("con MIME genérico solo acepta extensiones de la lista", () => {
    expect(pickUploadExtension({ originalname: "notas.md", mimetype: "" }, DOC_TYPES)).toBe(".md");
    expect(pickUploadExtension({ originalname: "foto.png", mimetype: "application/octet-stream" }, IMAGE_TYPES)).toBe(".png");
    expect(pickUploadExtension({ originalname: "x.html", mimetype: "application/octet-stream" }, DOC_TYPES)).toBeNull();
  });

  test("rechaza MIME no permitidos aunque la extensión lo sea", () => {
    expect(pickUploadExtension({ originalname: "x.png", mimetype: "text/html" }, IMAGE_TYPES)).toBeNull();
    expect(pickUploadExtension({ originalname: "x.svg", mimetype: "image/svg+xml" }, IMAGE_TYPES)).toBeNull();
  });
});

describe("Normalización de extensiones en las subidas", () => {
  test("POST /v1/photos: la extensión se deriva del MIME", async () => {
    const res = await request(app)
      .post("/v1/photos")
      .set("x-api-key", process.env.API_KEY)
      .attach("file", XSS, { filename: "x.html", contentType: "image/png" });
    expect(res.statusCode).toBe(201);
    expect(res.body.url).toMatch(/\.png$/);

    const served = await request(app).get(res.body.url);
    expect(served.headers["content-type"]).toMatch(/^image\/png/);
    expect(served.headers["x-content-type-options"]).toBe("nosniff");
    expect(served.headers["content-security-policy"]).toContain("sandbox");
  });

  test("POST /v1/photos: text/html se rechaza", async () => {
    const res = await request(app)
      .post("/v1/photos")
      .set("x-api-key", process.env.API_KEY)
      .attach("file", XSS, { filename: "x.png", contentType: "text/html" });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
  });

  test("POST /v1/issues: foto y documento usan la extensión de su MIME", async () => {
    const res = await createIssue()
      .attach("photo", XSS, { filename: "evil.html", contentType: "image/jpeg" })
      .attach("file", XSS, { filename: "evil.html", contentType: "text/plain" });
    expect(res.statusCode).toBe(201);
    expect(res.body.photo_url).toMatch(/\.jpg$/);
    expect(res.body.text_url).toMatch(/\.txt$/);

    const doc = await request(app).get(res.body.text_url);
    expect(doc.headers["content-type"]).toMatch(/^text\/plain/);
  });

  test("POST /v1/issues: documento .md con MIME vacío se acepta como .md", async () => {
    const res = await createIssue()
      .attach("file", Buffer.from("# Notas"), { filename: "notas.md", contentType: "application/octet-stream" });
    expect(res.statusCode).toBe(201);
    expect(res.body.text_url).toMatch(/\.md$/);
  });

  test("POST /v1/issues: extensión no permitida con MIME genérico se rechaza", async () => {
    const res = await createIssue()
      .attach("file", XSS, { filename: "evil.html", contentType: "application/octet-stream" });
    expect(res.statusCode).toBe(400);
  });

  test("POST /v1/auth/me/avatar: SVG se rechaza", async () => {
    const res = await request(app)
      .post("/v1/auth/me/avatar")
      .set("x-api-key", process.env.API_KEY)
      .attach("avatar", Buffer.from("<svg onload=alert(1)/>"), { filename: "a.svg", contentType: "image/svg+xml" });
    expect(res.statusCode).toBe(400);
  });
});

describe("Cabeceras de /uploads", () => {
  test("ficheros antiguos con extensión no permitida se sirven como descarga", async () => {
    fs.writeFileSync(path.join(UPLOAD_DIR, "photo_legacy.html"), XSS);
    const res = await request(app).get("/uploads/photo_legacy.html");
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("application/octet-stream");
    expect(res.headers["content-disposition"]).toBe("attachment");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["content-security-policy"]).toContain("sandbox");
  });

  test("los PDF se sirven inline, con nosniff y sin sandbox (Chrome no los mostraría)", async () => {
    fs.writeFileSync(path.join(UPLOAD_DIR, "doc_test.pdf"), "%PDF-1.4");
    const res = await request(app).get("/uploads/doc_test.pdf");
    expect(res.headers["content-type"]).toMatch(/^application\/pdf/);
    expect(res.headers["content-disposition"]).toBe("inline");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["content-security-policy"]).toBeUndefined();
  });
});
