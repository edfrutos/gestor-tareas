// src/server.js
const app = require("./app");
const { migrate, openDb, closeDb } = require("./db/sqlite");
const { logger } = require("./middleware/logger");

// Backup system
require("./cron/backup");

const HOST = process.env.HOST || "0.0.0.0";
const PORT = Number(process.env.PORT || 3000);

const GRACE_MS = Number(process.env.SHUTDOWN_GRACE_MS || 3000);
const FORCE_MS = Number(process.env.SHUTDOWN_FORCE_MS || 6000);

async function main() {
  openDb();
  migrate();

  const server = app.listen(PORT, HOST, () => {
    logger.info({ HOST, PORT }, "[server] listening");
  });

  let shuttingDown = false;

  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;

    logger.info({ signal }, "[server] shutdown start");

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