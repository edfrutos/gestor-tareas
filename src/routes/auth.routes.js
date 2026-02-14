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
  password: z.string().min(6),
  role: z.enum(["admin", "user"]).optional().default("user"),
});

const changePasswordSchema = z.object({
  currentPassword: z.string(),
  newPassword: z.string().min(6),
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
      { id: user.id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: "24h" }
    );

    res.json({
      token,
      user: { id: user.id, username: user.username, role: user.role }
    });
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors });
    next(e);
  }
});

// POST /v1/auth/register (Para desarrollo/primer usuario)
router.post("/register", async (req, res, next) => {
  try {
    const { username, password, role } = registerSchema.parse(req.body);
    
    // Verificar si ya existe
    const exists = await get("SELECT id FROM users WHERE username = ?", [username]);
    if (exists) return res.status(400).json({ error: "El usuario ya existe" });

    const hash = await bcrypt.hash(password, 10);
    const createdAt = new Date().toISOString();

    const result = await run(
      "INSERT INTO users (username, password_hash, role, created_at) VALUES (?, ?, ?, ?)",
      [username, hash, role, createdAt]
    );

    res.status(201).json({ id: result.lastID, username, role });
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors });
    next(e);
  }
});

// GET /v1/auth/me
router.get("/me", requireAuth(), async (req, res) => {
  res.json({ user: req.user });
});

// PATCH /v1/auth/me/password
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
