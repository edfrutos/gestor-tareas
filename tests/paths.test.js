"use strict";

const path = require("path");
const { resolveSafe, ROOT_DIR } = require("../src/config/paths");

describe("resolveSafe", () => {
  const baseDir = path.join(ROOT_DIR, "uploads");

  test("acepta rutas relativas válidas bajo baseDir", () => {
    expect(resolveSafe(baseDir, "photo.jpg")).toBe(path.join(baseDir, "photo.jpg"));
    expect(resolveSafe(baseDir, "thumbs/photo.webp")).toBe(path.join(baseDir, "thumbs", "photo.webp"));
    expect(resolveSafe(baseDir, "subdir/file.txt")).toBe(path.join(baseDir, "subdir", "file.txt"));
  });

  test("acepta nombres con dos puntos que no son segmento .. (ej. foto..bak)", () => {
    expect(resolveSafe(baseDir, "foto..bak")).toBe(path.join(baseDir, "foto..bak"));
    expect(resolveSafe(baseDir, "archivo..txt")).toBe(path.join(baseDir, "archivo..txt"));
  });

  test("rechaza rutas con segmento .. en cualquier posición", () => {
    expect(resolveSafe(baseDir, "..")).toBeNull();
    expect(resolveSafe(baseDir, "../etc/passwd")).toBeNull();
    expect(resolveSafe(baseDir, "a/../b")).toBeNull();
    expect(resolveSafe(baseDir, "sub/../../escape")).toBeNull();
    expect(resolveSafe(baseDir, "a/b/../c")).toBeNull();
  });

  test("rechaza rutas absolutas", () => {
    expect(resolveSafe(baseDir, "/etc/passwd")).toBeNull();
    expect(resolveSafe(baseDir, path.join(baseDir, "photo.jpg"))).toBeNull();
  });

  test("rechaza cadenas con carácter nulo", () => {
    expect(resolveSafe(baseDir, "photo\x00.jpg")).toBeNull();
    expect(resolveSafe(baseDir, "a\x00b")).toBeNull();
  });

  test("rechaza inputs vacíos, nulos o no string", () => {
    expect(resolveSafe(baseDir, null)).toBeNull();
    expect(resolveSafe(baseDir, undefined)).toBeNull();
    expect(resolveSafe(baseDir, "")).toBeNull();
    expect(resolveSafe(baseDir, "   ")).toBeNull();
    expect(resolveSafe(baseDir, 123)).toBeNull();
    expect(resolveSafe(baseDir, {})).toBeNull();
  });

  test("rechaza rutas que escapan del baseDir por composición", () => {
    const subBase = path.join(baseDir, "sub");
    expect(resolveSafe(subBase, "../escape")).toBeNull();
    expect(resolveSafe(subBase, "..")).toBeNull();
    expect(resolveSafe(subBase, "a/../../../etc/passwd")).toBeNull();
  });

  test("rechaza sin lanzar errores en casos límite", () => {
    expect(() => resolveSafe(baseDir, "..")).not.toThrow();
    expect(() => resolveSafe(baseDir, null)).not.toThrow();
    expect(() => resolveSafe(baseDir, "a\x00b")).not.toThrow();
  });
});
