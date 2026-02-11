const express = require("express");
const bcrypt = require("bcryptjs");
const { z } = require("zod");
const { run, get, all } = require("../db/sqlite");
const requireAuth = require("../middleware/auth.middleware");

const router = express.Router();

// Middleware para verificar rol admin
function requireAdmin(req, res, next) {
  if (req.user && req.user.role === 'admin') {
    return next();
  }
  return res.status(403).json({ error: { code: "forbidden", message: "Acceso denegado: Se requiere rol de administrador" } });
}

// GET /v1/users - Listar todos los usuarios con paginación
router.get("/", requireAuth(), requireAdmin, async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.max(1, Math.min(100, Number(req.query.pageSize) || 20));
    const offset = (page - 1) * pageSize;

    const users = await all(
      "SELECT id, username, role, created_at FROM users ORDER BY username ASC LIMIT ? OFFSET ?",
      [pageSize, offset]
    );
    const countRow = await get("SELECT COUNT(*) as total FROM users");
    
    res.json({
      items: users,
      total: countRow ? countRow.total : 0,
      page,
      pageSize
    });
  } catch (e) {
    next(e);
  }
});

// PATCH /v1/users/:id - Actualizar rol o password (admin)
router.patch("/:id", requireAuth(), requireAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const schema = z.object({
      role: z.enum(["admin", "user"]).optional(),
      password: z.string().min(6).optional()
    });
    
    const body = schema.parse(req.body);
    const { role, password } = body;

    if (!id) return res.status(400).json({ error: "ID inválido" });
    
    // Evitar que el admin se quite permisos a sí mismo si es el único, o editarse a sí mismo de forma destructiva
    // Pero permitimos editarse a sí mismo en general.
    
    const updates = [];
    const params = [];

    if (role) {
      updates.push("role = ?");
      params.push(role);
    }

    if (password) {
      const hash = await bcrypt.hash(password, 10);
      updates.push("password_hash = ?");
      params.push(hash);
    }

    if (updates.length === 0) return res.status(400).json({ error: "Nada que actualizar" });

    params.push(id);
    await run(`UPDATE users SET ${updates.join(", ")} WHERE id = ?`, params);

    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// DELETE /v1/users/:id - Borrar usuario
router.delete("/:id", requireAuth(), requireAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "ID inválido" });

    // Evitar borrarse a sí mismo
    if (id === req.user.id) {
        return res.status(400).json({ error: { code: "bad_request", message: "No puedes borrar tu propio usuario desde aquí." } });
    }

    await run("DELETE FROM users WHERE id = ?", [id]);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
