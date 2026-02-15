// src/services/mail.service.js
const nodemailer = require("nodemailer");

/**
 * Servicio de envío de correos electrónicos.
 * Configurable mediante variables de entorno:
 * SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
 */

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "localhost",
  port: Number(process.env.SMTP_PORT) || 1025, // Mailhog default
  secure: process.env.SMTP_SECURE === "true",
  auth: process.env.SMTP_USER ? {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  } : undefined,
});

const FROM_EMAIL = process.env.SMTP_FROM || '"Gestor de Tareas" <no-reply@cola-ciudadana.local>';

async function sendMail({ to, subject, text, html }) {
  // Si no hay configuración SMTP real y estamos en desarrollo, logueamos el correo
  if (!process.env.SMTP_USER && process.env.NODE_ENV !== "production") {
    console.log("------------------------------------------");
    console.log(`[MAIL DEBUG] Enviando correo a: ${to}`);
    console.log(`[MAIL DEBUG] Asunto: ${subject}`);
    console.log(`[MAIL DEBUG] Cuerpo: ${text}`);
    console.log("------------------------------------------");
    return { messageId: "debug-id" };
  }

  try {
    const info = await transporter.sendMail({
      from: FROM_EMAIL,
      to,
      subject,
      text,
      html,
    });
    console.log(`[MailService] Correo enviado: ${info.messageId}`);
    return info;
  } catch (err) {
    console.error("[MailService] Error enviando correo:", err);
    // No lanzamos error para no bloquear el flujo principal de la app
    return null;
  }
}

/**
 * Notifica al autor cuando cambia el estado de su tarea.
 */
async function notifyStatusChange(user, issue, oldStatus, newStatus) {
  if (!user.email) return;

  const subject = `Actualización de tarea: ${issue.title}`;
  const statusLabels = {
    open: "Abierta",
    in_progress: "En Proceso",
    resolved: "Resuelta"
  };

  const text = `Hola ${user.username},
El estado de tu tarea "${issue.title}" ha cambiado de ${statusLabels[oldStatus]} a ${statusLabels[newStatus]}.

Puedes ver los detalles en la aplicación.`;

  const html = `
    <h2>Actualización de tarea</h2>
    <p>Hola <strong>${user.username}</strong>,</p>
    <p>El estado de tu tarea "<em>${issue.title}</em>" ha cambiado:</p>
    <p style="font-size: 1.2em;">
      <span style="color: gray;">${statusLabels[oldStatus]}</span> 
      &rarr; 
      <span style="font-weight: bold; color: green;">${statusLabels[newStatus]}</span>
    </p>
    <p>Puedes ver los detalles en la aplicación.</p>
  `;

  return sendMail({ to: user.email, subject, text, html });
}

/**
 * Notifica al administrador o equipo cuando se crea una nueva tarea.
 */
async function notifyNewIssue(adminEmail, creator, issue) {
  if (!adminEmail) return;

  const subject = `Nueva incidencia creada: ${issue.title}`;
  const text = `Se ha creado una nueva incidencia en el sistema.
Título: ${issue.title}
Categoría: ${issue.category}
Creado por: ${creator.username}

Descripción: ${issue.description}`;

  const html = `
    <h2>Nueva incidencia en el sistema</h2>
    <p><strong>Título:</strong> ${issue.title}</p>
    <p><strong>Categoría:</strong> ${issue.category}</p>
    <p><strong>Creado por:</strong> ${creator.username}</p>
    <hr>
    <p><strong>Descripción:</strong><br>${issue.description}</p>
  `;

  return sendMail({ to: adminEmail, subject, text, html });
}

/**
 * Notifica al usuario con un enlace para resetear su contraseña.
 */
async function notifyPasswordReset(user, token) {
  if (!user.email) return;

  // Limpiamos cualquier barra final de la URL base para evitar dobles barras
  const baseUrl = (process.env.PUBLIC_URL || 'https://cola-ciudadana.local').replace(/\/+$/, "");
  const resetUrl = `${baseUrl}/#reset-password?token=${token}`;
  const subject = `Recuperación de contraseña`;

  const text = `Hola ${user.username},
Has solicitado restablecer tu contraseña. Haz clic en el siguiente enlace para elegir una nueva:

${resetUrl}

Si no has solicitado este cambio, puedes ignorar este correo. Este enlace expirará en 1 hora.`;

  const html = `
    <h2>Recuperación de contraseña</h2>
    <p>Hola <strong>${user.username}</strong>,</p>
    <p>Has solicitado restablecer tu contraseña. Haz clic en el botón de abajo para elegir una nueva:</p>
    <div style="margin: 30px 0;">
      <a href="${resetUrl}" style="background-color: #7c5cff; color: white; padding: 12px 20px; text-decoration: none; border-radius: 10px; font-weight: bold;">Restablecer Contraseña</a>
    </div>
    <p>Si no has solicitado este cambio, puedes ignorar este correo de forma segura.</p>
    <p style="font-size: 0.8em; color: gray;">Este enlace expirará en 1 hora.</p>
  `;

  return sendMail({ to: user.email, subject, text, html });
}

/**
 * Notifica al usuario cuando se le asigna una tarea.
 */
async function notifyTaskAssignment(user, issue, assigner) {
  if (!user.email) return;

  const subject = `Tarea asignada: ${issue.title}`;
  const text = `Hola ${user.username},
${assigner.username} te ha asignado la tarea "${issue.title}".

Puedes ver los detalles y empezar a trabajar en ella desde la aplicación.`;

  const html = `
    <h2>Nueva tarea asignada</h2>
    <p>Hola <strong>${user.username}</strong>,</p>
    <p><strong>${assigner.username}</strong> te ha asignado la siguiente tarea:</p>
    <div style="background: #f9f9f9; padding: 15px; border-radius: 10px; border-left: 4px solid #7c5cff; margin: 20px 0;">
      <h3 style="margin-top: 0;">${issue.title}</h3>
      <p>${issue.description}</p>
    </div>
    <p>Puedes ver los detalles completos en la aplicación.</p>
  `;

  return sendMail({ to: user.email, subject, text, html });
}

module.exports = {
  sendMail,
  notifyStatusChange,
  notifyNewIssue,
  notifyPasswordReset,
  notifyTaskAssignment,
};
