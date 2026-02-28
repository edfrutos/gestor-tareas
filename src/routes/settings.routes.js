"use strict";

const express = require("express");
const requireAuth = require("../middleware/auth.middleware");
const { getAllSettings, setConfigValues } = require("../services/config.service");
const { emitEvent } = require("../services/socket.service");

const router = express.Router();

// GET /v1/settings - Solo Admin
router.get("/", requireAuth("admin"), async (req, res, next) => {
  try {
    const settings = await getAllSettings();
    res.json(settings);
  } catch (err) {
    next(err);
  }
});

// PATCH /v1/settings - Solo Admin
router.patch("/", requireAuth("admin"), async (req, res, next) => {
  try {
    const updates = req.body;
    if (!updates || typeof updates !== "object" || Array.isArray(updates)) {
      return res.status(400).json({ error: "Invalid payload" });
    }

    await setConfigValues(updates);

    const updatedSettings = await getAllSettings();
    
    // Notificar a todos los clientes que la configuración ha cambiado
    emitEvent("settings:updated", updatedSettings);

    res.json(updatedSettings);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
