// src/routes/comments.routes.js
const express = require("express");
const { z } = require("zod");
const { run, all, get } = require("../db/sqlite");
const requireAuth = require("../middleware/auth.middleware");
const { notifyNewComment } = require("../services/mail.service");

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

    // Notificar por email: autor de la tarea, asignado y autor del comentario padre (si es respuesta)
    try {
      const issue = await get(
        "SELECT i.title, i.created_by, i.assigned_to FROM issues i WHERE i.id = ?",
        [issueId]
      );
      if (issue) {
        const { title, created_by, assigned_to } = issue;
        const recipients = [];
        if (created_by && created_by !== userId) {
          const author = await get("SELECT id, username, email FROM users WHERE id = ?", [created_by]);
          if (author) recipients.push(author);
        }
        if (assigned_to && assigned_to !== userId) {
          const assignee = await get("SELECT id, username, email FROM users WHERE id = ?", [assigned_to]);
          if (assignee && !recipients.some((r) => r.id === assignee.id)) recipients.push(assignee);
        }
        // Si es respuesta, notificar también al autor del comentario padre
        if (parent_id) {
          const parentComment = await get("SELECT user_id FROM issue_comments WHERE id = ? AND issue_id = ?", [parent_id, issueId]);
          if (parentComment?.user_id && parentComment.user_id !== userId) {
            const parentAuthor = await get("SELECT id, username, email FROM users WHERE id = ?", [parentComment.user_id]);
            if (parentAuthor && !recipients.some((r) => r.id === parentAuthor.id)) recipients.push(parentAuthor);
          }
        }
        if (recipients.length > 0) {
          notifyNewComment(
            { username: req.user.username },
            { title },
            text,
            recipients,
            !!parent_id
          );
        }
      }
    } catch (mailErr) {
      console.error("[Comments] Error enviando notificación de comentario:", mailErr);
    }

    res.status(201).json(created);
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors });
    next(e);
  }
});

module.exports = router;
