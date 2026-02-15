const bcrypt = require("bcryptjs");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");

// Usar variable de entorno o fallback a la ruta estándar del contenedor
const dbFile = process.env.DB_FILE || path.join(__dirname, "..", "..", "data", "data.db");
console.log(`[Script] Usando base de datos: ${dbFile}`);

const db = new sqlite3.Database(dbFile, sqlite3.OPEN_READWRITE, (err) => {
  if (err) {
    console.error(`[Script] Error abriendo base de datos en ${dbFile}:`, err.message);
    process.exit(1);
  }
});

const args = process.argv.slice(2);
const username = args[0] || "admin";
const password = args[1] || "admin1234";
const role = "admin";

async function createOrUpdateAdmin() {
  try {
    const hash = await bcrypt.hash(password, 10);
    const now = new Date().toISOString();

    // Intentar insertar
    db.run(
      "INSERT INTO users (username, password_hash, role, created_at) VALUES (?, ?, ?, ?)",
      [username, hash, role, now],
      function(err) {
        if (err) {
          if (err.message.includes("UNIQUE")) {
            // Si ya existe, actualizar contraseña
            db.run(
              "UPDATE users SET password_hash = ? WHERE username = ?",
              [hash, username],
              (err2) => {
                if (err2) console.error("Error actualizando admin:", err2.message);
                else console.log(`Contraseña de '${username}' actualizada a: ${password}`);
                db.close();
              }
            );
          } else {
            console.error("Error creando admin:", err.message);
            db.close();
          }
        } else {
          console.log(`Usuario creado: ${username} / ${password}`);
          db.close();
        }
      }
    );
  } catch (e) {
    console.error(e);
    db.close();
  }
}

createOrUpdateAdmin();
