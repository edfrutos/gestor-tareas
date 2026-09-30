// Crea un usuario admin o, si ya existe, le cambia la contraseña.
//   node src/scripts/create-admin.js [usuario] [contraseña]
const fs = require("fs");
const bcrypt = require("bcryptjs");
const { getDbFile } = require("../config/paths");
const { get, run, closeDb } = require("../db/sqlite");

const dbFile = getDbFile();
console.log(`[Script] Usando base de datos: ${dbFile}`);

// Como antes (OPEN_READWRITE): no crear una BD vacía si la ruta es incorrecta.
if (!fs.existsSync(dbFile)) {
  console.error(`[Script] Error: no existe la base de datos en ${dbFile}`);
  process.exit(1);
}

const args = process.argv.slice(2);
const username = args[0] || "admin";
const password = args[1] || "admin1234";
const role = "admin";

async function createOrUpdateAdmin() {
  const hash = await bcrypt.hash(password, 10);
  const existing = await get("SELECT id FROM users WHERE username = ?", [username]);

  if (existing) {
    // Nueva contraseña: también se revocan sus sesiones abiertas (token_version).
    await run("UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE id = ?", [hash, existing.id]);
    console.log(`Contraseña de '${username}' actualizada a: ${password}`);
  } else {
    await run(
      "INSERT INTO users (username, password_hash, role, created_at) VALUES (?, ?, ?, ?)",
      [username, hash, role, new Date().toISOString()]
    );
    console.log(`Usuario creado: ${username} / ${password}`);
  }
}

createOrUpdateAdmin()
  .catch((err) => {
    console.error("Error creando/actualizando admin:", err.message);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
