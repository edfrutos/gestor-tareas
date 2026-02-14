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

module.exports = {
  sendMail,
  notifyStatusChange,
  notifyNewIssue,
};
