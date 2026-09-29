// src/services/session.service.js
"use strict";

const { get, run } = require("../db/sqlite");
const { signToken, verifyToken } = require("../config/secrets");

/**
 * Sesiones JWT contrastadas con la BD.
 *
 * El token lleva `tv` (users.token_version). Un token solo vale si el usuario
 * sigue existiendo y su `token_version` coincide; subirla revoca de golpe
 * todas sus sesiones. El rol se toma siempre de la BD, no del token.
 * Los tokens sin `tv` (emitidos antes de esta versión) cuentan como 0.
 */

function issueToken(user) {
  return signToken(
    {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      tv: user.token_version ?? 0,
    },
    { expiresIn: "24h" }
  );
}

/** Usuario actual para un JWT, o `null` si el token no es válido o está revocado. */
async function resolveSessionUser(token) {
  let decoded;
  try {
    decoded = verifyToken(token);
  } catch (_err) {
    return null;
  }

  const user = await get(
    "SELECT id, username, email, role, token_version FROM users WHERE id = ?",
    [decoded.id]
  );
  if (!user) return null;
  if ((decoded.tv ?? 0) !== (user.token_version ?? 0)) return null;

  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    token_version: user.token_version ?? 0,
  };
}

/** Invalida todos los tokens del usuario y cierra sus sockets abiertos. */
async function revokeUserSessions(userId) {
  await run("UPDATE users SET token_version = token_version + 1 WHERE id = ?", [userId]);
  // Carga diferida: socket.service depende de este módulo.
  require("./socket.service").disconnectUser(userId);
}

/** Token nuevo tras revocar (p. ej. al cambiar la propia contraseña). */
async function reissueToken(userId) {
  const user = await get(
    "SELECT id, username, email, role, token_version FROM users WHERE id = ?",
    [userId]
  );
  return user ? issueToken(user) : null;
}

module.exports = { issueToken, resolveSessionUser, revokeUserSessions, reissueToken };
