const bcrypt = require("bcryptjs");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const dbFile = path.join(__dirname, "data", "data.db");
const db = new sqlite3.Database(dbFile);

const username = "admin";
const password = "password123";
const role = "admin";

async function createAdmin() {
  const hash = await bcrypt.hash(password, 10);
  const now = new Date().toISOString();

  db.run(
    "INSERT INTO users (username, password_hash, role, created_at) VALUES (?, ?, ?, ?)",
    [username, hash, role, now],
    (err) => {
      if (err) {
        if (err.message.includes("UNIQUE")) console.log("El usuario admin ya existe.");
        else console.error("Error creando admin:", err.message);
      } else {
        console.log(`Usuario creado: ${username} / ${password}`);
      }
      db.close();
    }
  );
}

createAdmin();
