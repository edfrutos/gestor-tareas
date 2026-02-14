const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { run, get } = require("../db/sqlite");
const { z } = require("zod");
const requireAuth = require("../middleware/auth.middleware");

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-key-12345";

const loginSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),
});

const registerSchema = z.object({
  username: z.string().trim().min(3).max(20),
  email: z.string().email().optional().or(z.literal("")),
  password: z.string().min(6),
  role: z.enum(["admin", "user"]).optional().default("user"),
});

const changePasswordSchema = z.object({
  currentPassword: z.string(),
  newPassword: z.string().min(6),
});

const updateMeSchema = z.object({
  email: z.string().email().optional().nullable().or(z.literal("")),
  currentPassword: z.string().optional().or(z.literal("")),
  newPassword: z.string().min(6).optional().or(z.literal("")),
});

// POST /v1/auth/login
router.post("/login", async (req, res, next) => {
  try {
    const { username, password } = loginSchema.parse(req.body);

    const user = await get("SELECT * FROM users WHERE username = ?", [username]);
    if (!user) {
      return res.status(401).json({ error: "Usuario o contraseña incorrectos" });
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: "Usuario o contraseña incorrectos" });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: "24h" }
    );

    res.json({
      token,
      user: { id: user.id, username: user.username, email: user.email, role: user.role }
    });
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors });
    next(e);
  }
});

// POST /v1/auth/register (Para desarrollo/primer usuario)
router.post("/register", async (req, res, next) => {
  try {
    const { username, email, password, role } = registerSchema.parse(req.body);
    
    // Verificar si ya existe
    const exists = await get("SELECT id FROM users WHERE username = ?", [username]);
    if (exists) return res.status(400).json({ error: "El usuario ya existe" });

    if (email) {
      const emailExists = await get("SELECT id FROM users WHERE email = ?", [email]);
      if (emailExists) return res.status(400).json({ error: "El email ya está en uso" });
    }

    const hash = await bcrypt.hash(password, 10);
    const createdAt = new Date().toISOString();

    const result = await run(
      "INSERT INTO users (username, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)",
      [username, email || null, hash, role, createdAt]
    );

    res.status(201).json({ id: result.lastID, username, email, role });
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors });
    next(e);
  }
});

// GET /v1/auth/me
router.get("/me", requireAuth(), async (req, res, next) => {
  try {
    const user = await get("SELECT id, username, email, role FROM users WHERE id = ?", [req.user.id]);
    if (!user) return res.status(404).json({ error: "Usuario no encontrado" });
    res.json({ user });
  } catch (e) {
    next(e);
  }
});

// PATCH /v1/auth/me
router.patch("/me", requireAuth(), async (req, res, next) => {
  try {
    const { email, currentPassword, newPassword } = updateMeSchema.parse(req.body);
    const userId = req.user.id;

    const user = await get("SELECT * FROM users WHERE id = ?", [userId]);
    if (!user) return res.status(404).json({ error: "Usuario no encontrado" });

    const updates = [];
    const params = [];

    if (email !== undefined) {
      // Verificar unicidad si cambia
      if (email && email !== user.email) {
        const exists = await get("SELECT id FROM users WHERE email = ? AND id != ?", [email, userId]);
        if (exists) return res.status(400).json({ error: "El email ya está en uso" });
      }
      updates.push("email = ?");
      params.push(email || null);
    }

    if (newPassword && typeof newPassword === "string" && newPassword.trim().length > 0) {
      if (!currentPassword || !currentPassword.trim()) {
        return res.status(400).json({ error: "Debes proporcionar la contraseña actual para establecer una nueva" });
      }
      const valid = await bcrypt.compare(currentPassword, user.password_hash);
      if (!valid) return res.status(403).json({ error: "Contraseña actual incorrecta" });

      const newHash = await bcrypt.hash(newPassword, 10);
      updates.push("password_hash = ?");
      params.push(newHash);
    }

    if (updates.length === 0) return res.status(400).json({ error: "Nada que actualizar" });

    params.push(userId);
    await run(`UPDATE users SET ${updates.join(", ")} WHERE id = ?`, params);

    res.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors });
    next(e);
  }
});

// PATCH /v1/auth/me/password (Mantener para retrocompatibilidad si es necesario, o eliminar si se prefiere unificar)
router.patch("/me/password", requireAuth(), async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);
    const userId = req.user.id;

    const user = await get("SELECT * FROM users WHERE id = ?", [userId]);
    if (!user) return res.status(404).json({ error: "Usuario no encontrado" });

    const valid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!valid) return res.status(403).json({ error: "Contraseña actual incorrecta" });

    const newHash = await bcrypt.hash(newPassword, 10);
    await run("UPDATE users SET password_hash = ? WHERE id = ?", [newHash, userId]);

    res.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors });
    next(e);
  }
});

module.exports = { router };
