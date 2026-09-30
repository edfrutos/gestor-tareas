// src/schemas/password.schema.js
"use strict";

const { z } = require("zod");

// Solo para contraseñas nuevas (registro, cambio, reset, alta por admin). El
// login no valida longitud: las contraseñas anteriores más cortas siguen
// sirviendo para entrar. Mantener en sincronía con la web (index.html) y la
// app de macOS (PasswordPolicy).
const PASSWORD_MIN_LENGTH = 8;

const newPasswordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres`);

module.exports = { PASSWORD_MIN_LENGTH, newPasswordSchema };
