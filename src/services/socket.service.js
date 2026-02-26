"use strict";

const { Server } = require("socket.io");
const { logger } = require("../middleware/logger");

let io = null;

/**
 * Inicializa Socket.io con el servidor HTTP
 * @param {import("http").Server} httpServer 
 */
function initSocket(httpServer) {
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
  }
}

module.exports = {
  initSocket,
  getIo,
  emitEvent
};
