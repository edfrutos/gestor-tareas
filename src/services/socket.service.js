"use strict";

const { Server } = require("socket.io");
const { logger } = require("../middleware/logger");

let io = null;
let boundServer = null;

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

  io.on("connection", (socket) => {
    logger.info({ socketId: socket.id }, "[socket] client connected");

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

module.exports = {
  initSocket,
  getIo,
  emitEvent
};
