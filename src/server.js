// src/server.js
const http = require("http");
const https = require("https");
const fs = require("fs");
const app = require("./app");
const { migrate, openDb, closeDb } = require("./db/sqlite");
const { logger } = require("./middleware/logger");
const { initSocket } = require("./services/socket.service");

// Backup system
require("./cron/backup");
// DB health monitoring (integrity_check periódico)
require("./cron/db-health");

const HOST = process.env.HOST || "0.0.0.0";
const PORT = Number(process.env.PORT || 3000);

const GRACE_MS = Number(process.env.SHUTDOWN_GRACE_MS || 3000);
const FORCE_MS = Number(process.env.SHUTDOWN_FORCE_MS || 6000);

async function main() {
  openDb();
  await migrate();

  // Crear servidor HTTP o HTTPS según configuración
  let server;
  const useHttps = process.env.SSL_CERT_PATH && process.env.SSL_KEY_PATH;

  if (useHttps) {
    try {
      const cert = fs.readFileSync(process.env.SSL_CERT_PATH);
      const key = fs.readFileSync(process.env.SSL_KEY_PATH);
      server = https.createServer({ cert, key }, app);
      logger.info("[server] HTTPS enabled");
    } catch (err) {
      logger.warn({ err: err.message }, "[server] HTTPS certificates not found, falling back to HTTP");
      server = http.createServer(app);
    }
  } else {
    server = http.createServer(app);
  }

  // Initialize Socket.io
  const io = initSocket(server);

  server.listen(PORT, HOST, () => {
    const protocol = useHttps ? "HTTPS" : "HTTP";
    logger.info({ HOST, PORT, protocol }, `[server] listening on ${protocol}`);
  });

  let shuttingDown = false;

  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;

    logger.info({ signal }, "[server] shutdown start");

    try {
      if (io) await io.close();
    } catch (_err) { /* noop */ }

    // deja de aceptar nuevas conexiones
    server.close(async () => {
      try {
        await closeDb();
        logger.info("[server] db closed");
      } catch (_err) {
        // noop
      }

      logger.info("[server] shutdown complete");
      process.exit(0);
    });

    // si se atasca, forzar salida
    setTimeout(() => {
      logger.error("[server] force shutdown");
      process.exit(1);
    }, GRACE_MS + FORCE_MS).unref();
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((e) => {
  try {
    logger?.error?.({ err: e }, "[server] fatal");
  } catch (logErr) {
    // fallback garantizado: stderr
    try {
      console.error("[server] fatal", e);
      console.error("[server] logger.error failed", logErr);
    } catch (_) {
      try {
        const msg =
          "[server] fatal\n" +
          (e instanceof Error ? (e.stack || e.message) : String(e)) +
          "\n";
        process.stderr.write(msg);
      } catch (_innerErr) {
        // noop
      }
    }
  } finally {
    process.exit(1);
  }
});
