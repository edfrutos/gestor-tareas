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
const HTTPS_PORT = Number(process.env.HTTPS_PORT || 3443);

const GRACE_MS = Number(process.env.SHUTDOWN_GRACE_MS || 3000);
const FORCE_MS = Number(process.env.SHUTDOWN_FORCE_MS || 6000);

async function main() {
  openDb();
  await migrate();

  // Crear servidor HTTPS (principal)
  let mainServer;
  let ioServer;
  const useHttps = process.env.SSL_CERT_PATH && process.env.SSL_KEY_PATH;

  if (useHttps) {
    try {
      const cert = fs.readFileSync(process.env.SSL_CERT_PATH);
      const key = fs.readFileSync(process.env.SSL_KEY_PATH);
      mainServer = https.createServer({ cert, key }, app);
      logger.info("[server] HTTPS enabled");
    } catch (err) {
      logger.warn({ err: err.message }, "[server] HTTPS certificates not found, falling back to HTTP");
      mainServer = http.createServer(app);
    }
  } else {
    mainServer = http.createServer(app);
  }

  // Initialize Socket.io en el servidor principal
  ioServer = initSocket(mainServer);

  // Crear servidor HTTP de redirección (opcional, solo si HTTPS está habilitado)
  let httpRedirectServer;
  if (useHttps && PORT !== HTTPS_PORT) {
    const redirectApp = (req, res) => {
      const host = req.headers.host.split(':')[0];
      const redirectUrl = `https://${host}:${HTTPS_PORT}${req.url}`;
      res.writeHead(301, { 'Location': redirectUrl });
      res.end();
    };
    httpRedirectServer = http.createServer(redirectApp);
  }

  // Iniciar servidores
  mainServer.listen(useHttps ? HTTPS_PORT : PORT, HOST, () => {
    const protocol = useHttps ? "HTTPS" : "HTTP";
    const url = useHttps ? `https://${HOST}:${HTTPS_PORT}` : `http://${HOST}:${PORT}`;
    logger.info({ HOST, PORT: useHttps ? HTTPS_PORT : PORT, protocol }, `[server] listening on ${protocol} at ${url}`);
  });

  if (httpRedirectServer) {
    httpRedirectServer.listen(PORT, HOST, () => {
      logger.info({ PORT }, `[server] HTTP redirect listening on port ${PORT} -> HTTPS:${HTTPS_PORT}`);
    });
  }

  let shuttingDown = false;

  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;

    logger.info({ signal }, "[server] shutdown start");

    try {
      if (ioServer) await ioServer.close();
    } catch (_err) { /* noop */ }

    // deja de aceptar nuevas conexiones
    const closeServers = (callback) => {
      let closed = 0;
      const checkDone = () => {
        closed++;
        if ((httpRedirectServer ? 2 : 1) === closed) callback();
      };

      mainServer.close(checkDone);
      if (httpRedirectServer) httpRedirectServer.close(checkDone);
    };

    closeServers(async () => {
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
