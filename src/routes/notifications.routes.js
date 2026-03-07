// src/routes/notifications.routes.js
// Centro de notificaciones: actividad en tareas creadas o asignadas al usuario
const express = require("express");
const { all } = require("../db/sqlite");
const requireAuth = require("../middleware/auth.middleware");

const router = express.Router();

// GET /v1/notifications - Actividad en tareas del usuario (creadas o asignadas)
router.get("/", requireAuth(), async (req, res, next) => {
  try {
    const userId = req.user.id;

    // 1. Comentarios en tareas del usuario (donde él no es el autor del comentario)
    const comments = await all(
      `SELECT c.id, c.issue_id, c.user_id, c.parent_id, c.text, c.created_at,
              u.username as commenter_username,
              i.title as issue_title
       FROM issue_comments c
       JOIN users u ON c.user_id = u.id
       JOIN issues i ON c.issue_id = i.id
       WHERE (i.created_by = ? OR i.assigned_to = ?)
         AND c.user_id != ?
       ORDER BY c.created_at DESC
       LIMIT 100`,
      [userId, userId, userId]
    );

    // 2. Logs relevantes (cambios de estado, asignación, prioridad, etc.) en tareas del usuario
    const logs = await all(
      `SELECT l.id, l.issue_id, l.action, l.old_value, l.new_value, l.created_at,
              i.title as issue_title
       FROM issue_logs l
       JOIN issues i ON l.issue_id = i.id
       WHERE (i.created_by = ? OR i.assigned_to = ?)
       ORDER BY l.created_at DESC
       LIMIT 80`,
      [userId, userId]
    );

    // Combinar y ordenar por fecha
    const notifications = [];

    comments.forEach((c) => {
      const isReply = !!c.parent_id;
      notifications.push({
        type: isReply ? "reply" : "comment",
        issue_id: c.issue_id,
        issue_title: c.issue_title,
        commenter_username: c.commenter_username,
        text_preview: c.text?.slice(0, 120) + (c.text?.length > 120 ? "…" : ""),
        created_at: c.created_at,
      });
    });

    logs.forEach((l) => {
      if (l.action === "create") return; // No notificar creación propia
      notifications.push({
        type: "log",
        action: l.action,
        old_value: l.old_value,
        new_value: l.new_value,
        issue_id: l.issue_id,
        issue_title: l.issue_title,
        created_at: l.created_at,
      });
    });

    notifications.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    const limited = notifications.slice(0, 50);

    res.json({ items: limited });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
