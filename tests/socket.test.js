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
  let token;

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
      token = loginRes.body?.token;
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
    
    socketClient.once("test:event", (data) => {
      expect(data).toEqual(testData);
      done();
    });

    emitEvent("test:event", testData);
  });

  it("should receive 'issue:created' event", (done) => {
    const issueData = { id: 123, title: "Nueva Incidencia" };

    socketClient.once("issue:created", (data) => {
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

    socketClient.once("settings:updated", (data) => {
      expect(data).toEqual(settingsData);
      done();
    });

    emitEvent("settings:updated", settingsData);
  });

  it("only sends 'issue:created' to the creator/assignee/admins, not to an unrelated user (salas por usuario)", (done) => {
    (async () => {
      const rnd = Math.floor(Math.random() * 1000000);
      const otherUsername = `sockother${rnd}`;
      const regRes = await request(app)
        .post("/v1/auth/register")
        .send({ username: otherUsername, password: "password123", email: `${otherUsername}@test.com` });
      if (regRes.status !== 201) {
        throw new Error(`setup: register otro usuario falló (status ${regRes.status}): ${JSON.stringify(regRes.body)}`);
      }
      const loginRes = await request(app)
        .post("/v1/auth/login")
        .send({ username: otherUsername, password: "password123" });
      const otherToken = loginRes.body?.token;
      if (!otherToken) {
        throw new Error(`setup: login otro usuario falló (status ${loginRes.status}): ${JSON.stringify(loginRes.body)}`);
      }

      const otherClient = Client(`http://localhost:${port}`, {
        transports: ["websocket"],
        autoConnect: true,
        auth: { token: otherToken }
      });

      await new Promise((resolve, reject) => {
        otherClient.on("connect", resolve);
        otherClient.on("connect_error", reject);
      });

      let ownerReceived = false;
      let otherReceived = false;
      socketClient.once("issue:created", () => { ownerReceived = true; });
      otherClient.on("issue:created", () => { otherReceived = true; });

      const createRes = await request(app)
        .post("/v1/issues")
        .set("Authorization", `Bearer ${token}`)
        .send({
          title: "Tarea privada para salas",
          category: "general",
          description: "Solo debería verla su creador (y un admin)",
          lat: 40.0,
          lng: -3.0,
        });
      if (createRes.status !== 201) {
        throw new Error(`setup: crear issue falló (status ${createRes.status}): ${JSON.stringify(createRes.body)}`);
      }

      // Los eventos socket son async respecto a la respuesta HTTP: dar un
      // margen antes de comprobar que "otherClient" no ha recibido nada.
      await new Promise((resolve) => setTimeout(resolve, 300));

      otherClient.disconnect();
      expect(ownerReceived).toBe(true);
      expect(otherReceived).toBe(false);
    })().then(done).catch(done);
  }, 10000);
});
