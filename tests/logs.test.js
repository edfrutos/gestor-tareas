const request = require("supertest");
const fs = require("fs");
const path = require("path");
const os = require("os");

const TEST_DIR = path.join(os.tmpdir(), `cola-ciudadana-logs-${Date.now()}`);
fs.mkdirSync(TEST_DIR, { recursive: true });

process.env.DB_FILE = path.join(TEST_DIR, "test_logs.db");
process.env.UPLOAD_DIR = path.join(TEST_DIR, "uploads");
process.env.API_KEY = "test-secret";
process.env.PINO_LOG_LEVEL = "silent";

const app = require("../src/app");
const { migrate, closeDb } = require("../src/db/sqlite");

beforeAll(async () => {
  migrate();
  await new Promise((r) => setTimeout(r, 100));
});

afterAll(async () => {
  await closeDb();
  fs.rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("Audit Logs (History)", () => {
  let issueId;

  test("Creation generates a log entry", async () => {
    const res = await request(app)
      .post("/v1/issues")
      .set("x-api-key", process.env.API_KEY)
      .send({
        title: "Log Test Issue",
        category: "test",
        description: "Checking audit logs",
        lat: 40.0,
        lng: -3.0,
      });

    expect(res.statusCode).toBe(201);
    issueId = res.body.id;

    const logsRes = await request(app).get(`/v1/issues/${issueId}/logs`);
    expect(logsRes.statusCode).toBe(200);
    expect(logsRes.body.length).toBeGreaterThan(0);
    const log = logsRes.body.find(l => l.action === "create");
    expect(log).toBeDefined();
    expect(log.issue_id).toBe(issueId);
  });

  test("Status update generates a log entry", async () => {
    const res = await request(app)
      .patch(`/v1/issues/${issueId}`)
      .set("x-api-key", process.env.API_KEY)
      .send({ status: "in_progress" });

    expect(res.statusCode).toBe(200);

    const logsRes = await request(app).get(`/v1/issues/${issueId}/logs`);
    const log = logsRes.body.find(l => l.action === "update_status");
    expect(log).toBeDefined();
    expect(log.old_value).toBe("open");
    expect(log.new_value).toBe("in_progress");
  });

  test("Description update generates a log entry", async () => {
    const res = await request(app)
      .patch(`/v1/issues/${issueId}`)
      .set("x-api-key", process.env.API_KEY)
      .send({ description: "Updated description for logging" });

    expect(res.statusCode).toBe(200);

    const logsRes = await request(app).get(`/v1/issues/${issueId}/logs`);
    const log = logsRes.body.find(l => l.action === "update_description");
    expect(log).toBeDefined();
    expect(log.old_value).toBe("Checking audit logs");
    expect(log.new_value).toBe("Updated description for logging");
  });
});
