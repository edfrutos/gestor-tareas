"use strict";

const express = require("express");
const jwt = require("jsonwebtoken");
const { z } = require("zod");
const { run, get } = require("../db/sqlite");
const { getConfigValue } = require("../services/config.service");
const { notifyContactMessage } = require("../services/mail.service");
const { makeRateLimiter } = require("../middleware/rateLimit");

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-key-12345";

// Endpoint público (se usa desde el login): limitador propio y siempre
// activo, independiente de RATE_LIMIT_ENABLED, para frenar spam.
const contactLimiter = makeRateLimiter({
  windowMs: Number(process.env.CONTACT_RATE_LIMIT_WINDOW_MS || 60 * 60 * 1000),
  max: Number(process.env.CONTACT_RATE_LIMIT_MAX || 5),
  keyPrefix: "contact",
});

const singleLine = (max) =>
  z.string().trim().min(1).max(max).refine((v) => !/[\r\n]/.test(v), "No puede contener saltos de línea");

const contactSchema = z.object({
  name: singleLine(100),
  email: z.string().trim().email().max(200),
  subject: singleLine(150),
  message: z.string().trim().min(10).max(5000),
  source: z.enum(["web", "macos"]).optional(),
  // Honeypot: campo oculto en los formularios. Un humano lo deja vacío.
  website: z.string().optional(),
});

/** Usuario del JWT si viene uno válido; si no, `null` (el formulario no exige sesión). */
async function optionalUser(req) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    return await get("SELECT id, username, email FROM users WHERE id = ?", [decoded.id]);
  } catch (_e) {
    return null;
  }
}

// POST /v1/contact
router.post("/", contactLimiter, async (req, res, next) => {
  try {
    const data = contactSchema.parse(req.body);

    // Bot: respondemos igual que en éxito para no darle pistas, sin guardar nada.
    if (data.website && data.website.trim() !== "") {
      return res.status(201).json({ ok: true });
    }

    const user = await optionalUser(req);
    const now = new Date().toISOString();

    await run(
      `INSERT INTO contact_messages (user_id, name, email, subject, message, source, ip, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [user?.id ?? null, data.name, data.email, data.subject, data.message, data.source ?? null, req.ip ?? null, now]
    );

    const adminEmail = await getConfigValue("ADMIN_EMAIL");
    if (adminEmail) {
      notifyContactMessage(adminEmail, { ...data, username: user?.username }).catch((e) =>
        console.error("Error notifying contact message:", e)
      );
    }

    res.status(201).json({ ok: true, message: "Mensaje enviado. Te responderemos lo antes posible." });
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors });
    next(e);
  }
});

module.exports = router;
