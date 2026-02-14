const request = require("supertest");
const fs = require("fs");
const path = require("path");
const os = require("os");

// Configuración de entorno para tests de archivos
const TEST_DIR = path.join(os.tmpdir(), `cola-ciudadana-files-test-${Date.now()}`);
const UPLOAD_DIR = path.join(TEST_DIR, "uploads");
const THUMBS_DIR = path.join(UPLOAD_DIR, "thumbs");

// Asegurar directorios antes de iniciar app
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(THUMBS_DIR, { recursive: true });

process.env.DB_FILE = path.join(TEST_DIR, "test.db");
process.env.UPLOAD_DIR = UPLOAD_DIR;
process.env.API_KEY = "test-secret";
process.env.PINO_LOG_LEVEL = "silent";

// Importar app después de configurar env
const app = require("../src/app");
const { migrate, closeDb } = require("../src/db/sqlite");

// Helper para crear un archivo dummy
function createDummyFile(name, content = "dummy content") {
  const filePath = path.join(TEST_DIR, name);
  fs.writeFileSync(filePath, content);
  return filePath;
}

beforeAll(async () => {
  await migrate();
});

afterAll(async () => {
  await closeDb();
  // Limpieza total
  try {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
  } catch(e) { console.error(e); }
});

describe("File Cleanup Logic", () => {
  let issueId;
  let initialPhotoPath;
  let initialDocPath;

  test("POST /v1/issues creates files on disk", async () => {
    const photo = createDummyFile("initial.jpg");
    const doc = createDummyFile("initial.txt");

    const res = await request(app)
      .post("/v1/issues")
      .set("x-api-key", process.env.API_KEY)
      .field("title", "File Test")
      .field("category", "test")
      .field("description", "Testing files")
      .field("lat", 40)
      .field("lng", -3)
      .attach("photo", photo)
      .attach("file", doc);

    expect(res.statusCode).toBe(201);
    issueId = res.body.id;
    
    // Verificar rutas en respuesta
    expect(res.body.photo_url).toMatch(/^\/uploads\/photo_/);
    expect(res.body.text_url).toMatch(/^\/uploads\/doc_/);

    // Verificar existencia física
    const photoFilename = res.body.photo_url.replace("/uploads/", "");
    const docFilename = res.body.text_url.replace("/uploads/", "");
    
    initialPhotoPath = path.join(UPLOAD_DIR, photoFilename);
    initialDocPath = path.join(UPLOAD_DIR, docFilename);

    expect(fs.existsSync(initialPhotoPath)).toBe(true);
    expect(fs.existsSync(initialDocPath)).toBe(true);
  });

  test("PATCH /v1/issues replaces photo and deletes old one", async () => {
    const newPhoto = createDummyFile("new.png");

    const res = await request(app)
      .patch(`/v1/issues/${issueId}`)
      .set("x-api-key", process.env.API_KEY)
      .field("description", "Updated description for file test")
      .attach("photo", newPhoto);

    expect(res.statusCode).toBe(200);
    
    const newPhotoUrl = res.body.photo_url;
    expect(newPhotoUrl).not.toBeNull();
    expect(newPhotoUrl).not.toBe(initialPhotoPath.replace(UPLOAD_DIR, "/uploads")); // URL debe cambiar

    // 1. Verificar que la nueva foto existe
    const newPhotoPath = path.join(UPLOAD_DIR, newPhotoUrl.replace("/uploads/", ""));
    expect(fs.existsSync(newPhotoPath)).toBe(true);

    // 2. CRÍTICO: Verificar que la foto vieja FUE BORRADA
    expect(fs.existsSync(initialPhotoPath)).toBe(false);

    // El documento original NO debió tocarse
    expect(fs.existsSync(initialDocPath)).toBe(true);
  });

  test("DELETE /v1/issues removes all remaining files", async () => {
    // Recuperar estado actual para saber qué borrar
    const current = await request(app)
      .get("/v1/issues")
      .set("x-api-key", process.env.API_KEY);
    const issue = current.body.items.find(i => i.id === issueId);
    
    const currentPhotoPath = path.join(UPLOAD_DIR, issue.photo_url.replace("/uploads/", ""));
    const currentDocPath = path.join(UPLOAD_DIR, issue.text_url.replace("/uploads/", ""));

    expect(fs.existsSync(currentPhotoPath)).toBe(true);
    expect(fs.existsSync(currentDocPath)).toBe(true);

    const res = await request(app)
      .delete(`/v1/issues/${issueId}`)
      .set("x-api-key", process.env.API_KEY);

    expect(res.statusCode).toBe(200);

    // Verificar que TODO se borró
    expect(fs.existsSync(currentPhotoPath)).toBe(false);
    expect(fs.existsSync(currentDocPath)).toBe(false);
  });
});
