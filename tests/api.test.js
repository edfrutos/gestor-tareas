const request = require("supertest");
const fs = require("fs");
const path = require("path");
const os = require("os");

// Configuración de entorno para tests
const TEST_DIR = path.join(os.tmpdir(), `cola-ciudadana-test-${Date.now()}`);
fs.mkdirSync(TEST_DIR, { recursive: true });

process.env.DB_FILE = path.join(TEST_DIR, "test.db");
process.env.UPLOAD_DIR = path.join(TEST_DIR, "uploads");
process.env.API_KEY = "test-secret";
// Deshabilitar logs ruidosos
process.env.PINO_LOG_LEVEL = "silent";

// Importar dependencias del proyecto
const app = require("../src/app");
const { migrate, closeDb, run } = require("../src/db/sqlite");

beforeAll(async () => {
  // Inicializar DB
  await migrate();
});

afterAll(async () => {
  await closeDb();
  // Limpieza
  fs.rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("API Functional Tests", () => {
  let createdIssueId;

  test("GET /health returns 200", async () => {
    const res = await request(app).get("/health");
    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  test("GET /v1/issues returns empty list initially", async () => {
    const res = await request(app)
      .get("/v1/issues")
      .set("x-api-key", process.env.API_KEY);
    expect(res.statusCode).toBe(200);
    expect(res.body.items).toEqual([]);
    expect(res.body.total).toBe(0);
  });

  test("POST /v1/issues fails without API Key", async () => {
    const res = await request(app).post("/v1/issues").send({
      title: "Test Issue",
      category: "general",
      description: "Testing",
      lat: 40.0,
      lng: -3.0,
    });
    // El middleware apiKey puede devolver 401 o 403
    expect([401, 403]).toContain(res.statusCode);
  });

  test("POST /v1/issues creates an issue with API Key", async () => {
    const res = await request(app)
      .post("/v1/issues")
      .set("x-api-key", process.env.API_KEY)
      .send({
        title: "Farola rota",
        category: "alumbrado",
        description: "No enciende por la noche",
        lat: 40.416,
        lng: -3.703,
      });

    expect(res.statusCode).toBe(201);
    expect(res.body.title).toBe("Farola rota");
    expect(res.body.status).toBe("open");
    expect(res.body.id).toBeDefined();
    createdIssueId = res.body.id;
  });

  test("GET /v1/issues returns created issue", async () => {
    const res = await request(app)
      .get("/v1/issues")
      .set("x-api-key", process.env.API_KEY);
    expect(res.statusCode).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.items[0].id).toBe(createdIssueId);
    expect(res.body.items[0].title).toBe("Farola rota");
  });

  test("GET /v1/issues supports filtering", async () => {
    // Crear otra issue para probar filtros
    await request(app)
      .post("/v1/issues")
      .set("x-api-key", process.env.API_KEY)
      .send({
        title: "Banco roto",
        category: "mobiliario",
        description: "Madera astillada",
        lat: 40.417,
        lng: -3.704,
      });

    const resAll = await request(app)
      .get("/v1/issues")
      .set("x-api-key", process.env.API_KEY);
    expect(resAll.body.total).toBe(2);

    const resFilter = await request(app)
      .get("/v1/issues?category=alumbrado")
      .set("x-api-key", process.env.API_KEY);
    expect(resFilter.body.total).toBe(1);
    expect(resFilter.body.items[0].title).toBe("Farola rota");
  });

  test("POST /v1/issues allows custom categories", async () => {
    const customCat = "jardineria-" + Date.now();
    const res = await request(app)
      .post("/v1/issues")
      .set("x-api-key", process.env.API_KEY)
      .send({
        title: "Árbol caído",
        category: customCat,
        description: "Un pino bloquea el camino",
        lat: 40.418,
        lng: -3.705,
      });

    expect(res.statusCode).toBe(201);
    expect(res.body.category).toBe(customCat);
  });

  test("PATCH /v1/issues/:id updates status", async () => {
    const res = await request(app)
      .patch(`/v1/issues/${createdIssueId}`)
      .set("x-api-key", process.env.API_KEY)
      .send({ status: "resolved" });

    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe("resolved");

    // Verificar persistencia
    const check = await request(app)
      .get("/v1/issues")
      .set("x-api-key", process.env.API_KEY);
    const issue = check.body.items.find((i) => i.id === createdIssueId);
    expect(issue.status).toBe("resolved");
  });

  test("DELETE /v1/issues/:id removes the issue", async () => {
    const res = await request(app)
      .delete(`/v1/issues/${createdIssueId}`)
      .set("x-api-key", process.env.API_KEY);

    expect(res.statusCode).toBe(200);

    const check = await request(app)
      .get("/v1/issues")
      .set("x-api-key", process.env.API_KEY);
    const found = check.body.items.find((i) => i.id === createdIssueId);
    expect(found).toBeUndefined();
  });

  describe("Edge Cases & Validation", () => {
    test("POST /v1/issues fails with invalid coordinates", async () => {
      const res = await request(app)
        .post("/v1/issues")
        .set("x-api-key", process.env.API_KEY)
        .send({
          title: "Error de coordenadas",
          category: "test",
          lat: 100, // Inválido (>90)
          lng: -3.7,
        });
      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBeDefined();
    });

    test("POST /v1/issues accepts coordinates with comma (Spanish format)", async () => {
      const res = await request(app)
        .post("/v1/issues")
        .set("x-api-key", process.env.API_KEY)
        .send({
          title: "Coordenada con coma",
          category: "test",
          description: "Descripción obligatoria",
          lat: "40,416",
          lng: "-3,703",
        });
      expect(res.statusCode).toBe(201);
      expect(Number(res.body.lat)).toBe(40.416);
    });

    test("GET /v1/issues filters by date range", async () => {
      const today = new Date().toISOString().split("T")[0];
      const tomorrow = new Date(Date.now() + 86400000).toISOString().split("T")[0];

      // Filtrar por hoy: debería encontrar las creadas en este test
      const resToday = await request(app)
        .get(`/v1/issues?from=${today}&to=${today}`)
        .set("x-api-key", process.env.API_KEY);
      expect(resToday.body.total).toBeGreaterThan(0);

      // Filtrar por mañana: debería estar vacío
      const resFuture = await request(app)
        .get(`/v1/issues?from=${tomorrow}`)
        .set("x-api-key", process.env.API_KEY);
      expect(resFuture.body.total).toBe(0);

      // Filtrar con formato inválido: debería fallar (400) por validación Zod
      const resInvalid = await request(app)
        .get("/v1/issues?from=invalid-date")
        .set("x-api-key", process.env.API_KEY);
      expect(resInvalid.statusCode).toBe(400);
    });

    test("PATCH /v1/issues/:id fails with invalid status", async () => {
      // Usamos el ID de la issue creada anteriormente con coma
      const setup = await request(app)
        .get("/v1/issues")
        .set("x-api-key", process.env.API_KEY);
      const id = setup.body.items[0].id;

      const res = await request(app)
        .patch(`/v1/issues/${id}`)
        .set("x-api-key", process.env.API_KEY)
        .send({ status: "invalid_status_name" });
      
      expect(res.statusCode).toBe(400);
    });

    test("GET /v1/issues/export returns CSV", async () => {
      const res = await request(app)
        .get("/v1/issues/export")
        .set("x-api-key", process.env.API_KEY);
      expect(res.statusCode).toBe(200);
      expect(res.headers["content-type"]).toContain("text/csv");
      // Cabeceras reales en español: ID,Fecha,Creado Por,Estado,Categoría,Título...
      expect(res.text).toContain("ID,Fecha,Creado Por,Estado,Categoría,Título");
    });
  });
});
