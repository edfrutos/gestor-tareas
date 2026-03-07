"use strict";

/**
 * Test de integridad de BD (PRAGMA integrity_check).
 * Verifica que el procedimiento de detección de corrupción funcione.
 */

const { openDb, closeDb, migrate, integrityCheck } = require("../src/db/sqlite");

describe("DB integrity", () => {
  beforeAll(async () => {
    await openDb();
    await migrate();
  });

  afterAll(async () => {
    await closeDb();
  });

  it("integrityCheck returns ok for healthy database", async () => {
    const result = await integrityCheck();
    expect(result).toHaveProperty("ok");
    expect(result).toHaveProperty("result");
    expect(result.ok).toBe(true);
    expect(result.result).toBe("ok");
  });
});
