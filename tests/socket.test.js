"use strict";

const http = require("http");
const request = require("supertest");
const { io: Client } = require("socket.io-client");
const app = require("../src/app");
const { initSocket, emitEvent } = require("../src/services/socket.service");
const { openDb, closeDb, migrate } = require("../src/db/sqlite");

describe("WebSocket System", () => {
  let httpServer;
  let socketClient;
  let port;

  beforeAll((done) => {
    (async () => {
      await openDb();
      await migrate();
      httpServer = http.createServer(app);
      initSocket(httpServer);

      // El handshake exige un JWT válido (ver socket.service.js) — registramos
      // un usuario de prueba y usamos su token, igual que en zones.test.js.
      const rnd = Math.floor(Math.random() * 1000000);
      const username = `socktest${rnd}`;
      const regRes = await request(app)
        .post("/v1/auth/register")
        .send({ username, password: "password123", email: `${username}@test.com` });
      if (regRes.status !== 201) {
        throw new Error(`socket.test setup: register failed (status ${regRes.status}): ${JSON.stringify(regRes.body)}`);
      }
      const loginRes = await request(app)
        .post("/v1/auth/login")
        .send({ username, password: "password123" });
      const token = loginRes.body?.token;
      if (!token) {
        throw new Error(`socket.test setup: login failed (status ${loginRes.status}): ${JSON.stringify(loginRes.body)}`);
      }

      httpServer.listen(() => {
        port = httpServer.address().port;
        socketClient = Client(`http://localhost:${port}`, {
          transports: ["websocket"],
          autoConnect: true,
          auth: { token }
        });
        socketClient.on("connect", () => {
          done();
        });
        socketClient.on("connect_error", (err) => {
          done(err);
        });
      });
    })().catch(done);
  }, 10000);

  afterAll((done) => {
    if (socketClient && socketClient.connected) {
      socketClient.disconnect();
    }
    if (httpServer) {
      httpServer.close(() => {
        closeDb();
        done();
      });
    } else {
      closeDb();
      done();
    }
  });

  it("should receive an event when emitEvent is called", (done) => {
    const testData = { id: 1, message: "test event" };
    
    socketClient.on("test:event", (data) => {
      expect(data).toEqual(testData);
      done();
    });

    emitEvent("test:event", testData);
  });

  it("should receive 'issue:created' event", (done) => {
    const issueData = { id: 123, title: "Nueva Incidencia" };

    socketClient.on("issue:created", (data) => {
      expect(data).toEqual(issueData);
      done();
    });

    emitEvent("issue:created", issueData);
  });

  it("rejects a connection without a valid token", (done) => {
    const anon = Client(`http://localhost:${port}`, {
      transports: ["websocket"],
      autoConnect: true,
      auth: { token: "not-a-real-token" }
    });
    anon.on("connect", () => {
      anon.disconnect();
      done(new Error("no debería haberse podido conectar sin un token válido"));
    });
    anon.on("connect_error", (err) => {
      expect(err.message).toBe("unauthorized");
      anon.disconnect();
      done();
    });
  });

  it("should receive 'settings:updated' event", (done) => {
    const settingsData = { TEST: "VALUE" };

    socketClient.on("settings:updated", (data) => {
      expect(data).toEqual(settingsData);
      done();
    });

    emitEvent("settings:updated", settingsData);
  });
});
