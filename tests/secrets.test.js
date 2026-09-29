const { resolveJwtSecret } = require("../src/config/secrets");

describe("resolveJwtSecret", () => {
  const strong = "x".repeat(48);

  test("producción sin JWT_SECRET: no arranca", () => {
    expect(() => resolveJwtSecret({ NODE_ENV: "production" })).toThrow(/JWT_SECRET/);
    expect(() => resolveJwtSecret({ NODE_ENV: "production", JWT_SECRET: "  " })).toThrow(/JWT_SECRET/);
  });

  test("producción con un valor de ejemplo: no arranca", () => {
    for (const v of ["dev-secret-key-12345", "change_this_in_production", "changeme"]) {
      expect(() => resolveJwtSecret({ NODE_ENV: "production", JWT_SECRET: v })).toThrow(/JWT_SECRET/);
    }
  });

  test("producción con un secreto real: se usa", () => {
    expect(resolveJwtSecret({ NODE_ENV: "production", JWT_SECRET: strong })).toBe(strong);
  });

  test("producción con un secreto corto: arranca pero avisa", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    expect(resolveJwtSecret({ NODE_ENV: "production", JWT_SECRET: "corto-pero-propio" })).toBe("corto-pero-propio");
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  test("desarrollo/tests sin JWT_SECRET: usa el secreto de desarrollo", () => {
    expect(resolveJwtSecret({ NODE_ENV: "development" })).toBe("dev-secret-key-12345");
    expect(resolveJwtSecret({ NODE_ENV: "test" })).toBe("dev-secret-key-12345");
  });
});
