"use strict";

const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { Server } = require("socket.io");
const { logger } = require("../middleware/logger");

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-key-12345";

let io = null;
let boundServer = null;

/**
 * Autenticación del handshake — mismo criterio que `requireAuth()` (REST):
 * JWT válido, o API_KEY, o bypass en dev sin API_KEY configurada (nunca en
 * test/production). El token puede llegar como `auth.token` (clientes
 * modernos, incluida la web) o `query.token` (fallback, por si el cliente
 * Swift/macOS solo puede mandar query params en el handshake).
 *
 * Antes de esto, `io.emit()` mandaba cada evento a cualquiera que se
 * conectara al socket sin ninguna comprobación — cualquiera que supiera la
 * URL veía en vivo títulos/descripciones/asignaciones de todas las tareas.
 */
function authenticateSocket(socket, next) {
  const token = socket.handshake.auth?.token || socket.handshake.query?.token;

  if (token) {
    try {
      socket.user = jwt.verify(token, JWT_SECRET);
      return next();
    } catch (_err) {
      // token inválido como JWT: seguimos probando como API key
    }

    const expectedKey = process.env.API_KEY;
    if (expectedKey) {
      try {
        const a = Buffer.from(String(token));
        const b = Buffer.from(String(expectedKey));
        if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
          socket.user = { id: 1, username: "system", role: "admin" };
          return next();
        }
      } catch (_e) { /* noop */ }
    }
  }

  if (!process.env.API_KEY && process.env.NODE_ENV !== "production" && process.env.NODE_ENV !== "test") {
    socket.user = { id: 1, username: "dev-anonymous", role: "admin" };
    return next();
  }

  logger.warn({ socketId: socket.id }, "[socket] conexión rechazada: sin token válido");
  return next(new Error("unauthorized"));
}

/**
 * Inicializa Socket.io con el servidor HTTP
 * @param {import("http").Server} httpServer
 * @returns {import("socket.io").Server}
 */
function initSocket(httpServer) {
  if (io && boundServer === httpServer) {
    return io;
  }
  if (io) {
    io.close().catch(() => {});
    io = null;
    boundServer = null;
  }

  io = new Server(httpServer, {
    cors: {
      origin: "*", // En producción se podría restringir más
      methods: ["GET", "POST"]
    }
  });

  io.use(authenticateSocket);

  io.on("connection", (socket) => {
    logger.info({ socketId: socket.id, userId: socket.user?.id }, "[socket] client connected");

    // Sala por usuario (visibilidad de eventos, ver emitToUsers) + sala de
    // admins, que ven todo igual que en el filtrado RBAC de GET /v1/issues.
    if (socket.user?.id !== undefined && socket.user?.id !== null) {
      socket.join(`user:${socket.user.id}`);
    }
    if (socket.user?.role === "admin") {
      socket.join("role:admin");
    }

    socket.on("disconnect", (reason) => {
      logger.info({ socketId: socket.id, reason }, "[socket] client disconnected");
    });
  });

  boundServer = httpServer;
  return io;
}

/**
 * Obtiene la instancia de io
 */
function getIo() {
  return io;
}

/**
 * Emite un evento a todos los clientes conectados
 * @param {string} event
 * @param {any} data
 */
function emitEvent(event, data) {
  if (io) {
    io.emit(event, data);
  } else {
    const dataPreview = data === undefined ? "undefined" : typeof data === "object" ? JSON.stringify(data).slice(0, 80) : String(data);
    logger.warn({ event, dataPreview }, "[socket] emitEvent skipped: io not initialized");
  }
}

/**
 * Emite un evento solo a quienes tendrían visibilidad de la tarea según el
 * mismo criterio que el filtrado RBAC de `GET /v1/issues`: admins, el
 * creador y el asignado. Antes, `issue:created/updated/deleted` se mandaban
 * a `io.emit()` (broadcast a cualquier socket autenticado), así que un
 * usuario normal veía en tiempo real tareas que no podía listar por API.
 * @param {string} event
 * @param {any} data
 * @param {Array<number|null|undefined>} userIds - created_by / assigned_to relevantes
 */
function emitToUsers(event, data, userIds) {
  if (!io) {
    const dataPreview = data === undefined ? "undefined" : typeof data === "object" ? JSON.stringify(data).slice(0, 80) : String(data);
    logger.warn({ event, dataPreview }, "[socket] emitToUsers skipped: io not initialized");
    return;
  }
  const rooms = new Set(["role:admin"]);
  for (const id of userIds || []) {
    if (id !== null && id !== undefined) rooms.add(`user:${id}`);
  }
  io.to([...rooms]).emit(event, data);
}

/**
 * Fuerza la desconexión de todos los sockets abiertos de un usuario. Se usa
 * al borrar una cuenta (self-service o admin) para que no siga recibiendo/
 * mandando eventos con un JWT de un usuario que ya no existe en BD.
 * @param {number} userId
 */
function disconnectUser(userId) {
  if (!io) return;
  for (const socket of io.sockets.sockets.values()) {
    if (socket.user?.id === userId) {
      socket.disconnect(true);
    }
  }
}

module.exports = {
  initSocket,
  getIo,
  emitEvent,
  emitToUsers,
  disconnectUser
};
