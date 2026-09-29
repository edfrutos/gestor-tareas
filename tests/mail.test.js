"use strict";

// El HTML de los correos debe escapar todo dato de usuario. Se simula el
// transporte de nodemailer para capturar lo que se enviaría.
const sent = [];
jest.mock("nodemailer", () => ({
  createTransport: () => ({
    sendMail: async (msg) => {
      sent.push(msg);
      return { messageId: "test" };
    },
  }),
}));

process.env.SMTP_HOST = "smtp.test.local";

const mail = require("../src/services/mail.service");

const EVIL = `<img src=x onerror="alert(1)">`;
const issue = { title: `Título ${EVIL}`, category: `cat ${EVIL}`, description: `Línea 1\nLínea 2 ${EVIL}` };
const user = { username: `ana${EVIL}`, email: "ana@example.com" };

beforeEach(() => {
  sent.length = 0;
  jest.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

function expectEscaped(html) {
  expect(html).not.toContain("<img");
  expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
}

describe("HTML de los correos escapado", () => {
  test("cambio de estado", async () => {
    await mail.notifyStatusChange(user, issue, "open", "resolved");
    expectEscaped(sent[0].html);
  });

  test("nueva tarea (conserva los saltos de línea de la descripción)", async () => {
    await mail.notifyNewIssue("admin@example.com", user, issue);
    expectEscaped(sent[0].html);
    expect(sent[0].html).toContain("white-space: pre-wrap");
    expect(sent[0].html).toContain("Línea 1\nLínea 2");
  });

  test("tarea asignada", async () => {
    await mail.notifyTaskAssignment(user, issue, { username: `jefe${EVIL}` });
    expectEscaped(sent[0].html);
  });

  test("nuevo comentario", async () => {
    await mail.notifyNewComment({ username: `pepe${EVIL}` }, issue, `hola ${EVIL}`, [user]);
    expectEscaped(sent[0].html);
  });

  test("restablecer contraseña", async () => {
    await mail.notifyPasswordReset(user, "abc123");
    expectEscaped(sent[0].html);
    expect(sent[0].html).toContain("#reset-password?token=abc123");
  });

  test("el texto plano no se altera", async () => {
    await mail.notifyStatusChange(user, issue, "open", "resolved");
    expect(sent[0].text).toContain(issue.title);
  });
});
