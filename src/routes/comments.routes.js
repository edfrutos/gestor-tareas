// src/routes/comments.routes.js
const express = require("express");
const { z } = require("zod");
const { run, all } = require("../db/sqlite");
const requireAuth = require("../middleware/auth.middleware");

const router = express.Router({ mergeParams: true });

const createCommentSchema = z.object({
  text: z.string().trim().min(1).max(1000),
});

// GET /v1/issues/:id/comments - Listar comentarios
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

    res.json(comments);
  } catch (e) {
    next(e);
  }
});

// POST /v1/issues/:id/comments - Añadir comentario
router.post("/", requireAuth(), async (req, res, next) => {
  try {
    const issueId = Number(req.params.id);
    const { text } = createCommentSchema.parse(req.body);
    const userId = req.user.id;

    if (!issueId) return res.status(400).json({ error: "ID de tarea inválido" });

    const now = new Date().toISOString();
    await run(
      "INSERT INTO issue_comments (issue_id, user_id, text, created_at) VALUES (?, ?, ?, ?)",
      [issueId, userId, text, now]
    );

    // Devolver el comentario recién creado con el nombre de usuario
    const created = {
      issue_id: issueId,
      user_id: userId,
      username: req.user.username,
      text,
      created_at: now
    };

    res.status(201).json(created);
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors });
    next(e);
  }
});

module.exports = router;
