// src/routes/comments.routes.js
const express = require("express");
const { z } = require("zod");
const { run, all } = require("../db/sqlite");
const requireAuth = require("../middleware/auth.middleware");

const router = express.Router({ mergeParams: true });

const createCommentSchema = z.object({
  text: z.string().trim().min(1).max(1000),
  parent_id: z.number().optional().nullable(),
});

// GET /v1/issues/:id/comments - Listar comentarios (estructurados en árbol)
router.get("/", async (req, res, next) => {
  try {
    const issueId = Number(req.params.id);
    if (!issueId) return res.status(400).json({ error: "ID de tarea inválido" });

    const comments = await all(
      `SELECT c.*, u.username 
       FROM issue_comments c 
       JOIN users u ON c.user_id = u.id 
       WHERE c.issue_id = ? 
       ORDER BY c.created_at ASC`,
      [issueId]
    );

    // Convertir lista plana a estructura de árbol
    const commentMap = {};
    const roots = [];

    comments.forEach(c => {
      c.replies = [];
      commentMap[c.id] = c;
      if (c.parent_id) {
        if (commentMap[c.parent_id]) {
          commentMap[c.parent_id].replies.push(c);
        } else {
          // Si el padre no está (raro por FK), lo tratamos como raíz
          roots.push(c);
        }
      } else {
        roots.push(c);
      }
    });

    res.json(roots);
  } catch (e) {
    next(e);
  }
});

// POST /v1/issues/:id/comments - Añadir comentario
router.post("/", requireAuth(), async (req, res, next) => {
  try {
    const issueId = Number(req.params.id);
    const { text, parent_id } = createCommentSchema.parse(req.body);
    const userId = req.user.id;

    if (!issueId) return res.status(400).json({ error: "ID de tarea inválido" });

    // Verificar que el padre existe y pertenece a la misma issue si se proporciona
    if (parent_id) {
      const parent = await all("SELECT id FROM issue_comments WHERE id = ? AND issue_id = ?", [parent_id, issueId]);
      if (parent.length === 0) return res.status(400).json({ error: "El comentario padre no existe o no pertenece a esta tarea" });
    }

    const now = new Date().toISOString();
    const result = await run(
      "INSERT INTO issue_comments (issue_id, user_id, parent_id, text, created_at) VALUES (?, ?, ?, ?, ?)",
      [issueId, userId, parent_id || null, text, now]
    );

    // Devolver el comentario recién creado con el nombre de usuario
    const created = {
      id: result.lastID,
      issue_id: issueId,
      user_id: userId,
      parent_id: parent_id || null,
      username: req.user.username,
      text,
      created_at: now,
      replies: []
    };

    res.status(201).json(created);
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors });
    next(e);
  }
});

module.exports = router;
