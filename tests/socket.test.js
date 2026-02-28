"use strict";

const http = require("http");
const { io: Client } = require("socket.io-client");
const app = require("../src/app");
const { initSocket, emitEvent } = require("../src/services/socket.service");
const { openDb, closeDb } = require("../src/db/sqlite");

describe("WebSocket System", () => {
  let httpServer;
  let socketClient;
  let port;

  beforeAll((done) => {
    openDb();
    httpServer = http.createServer(app);
    initSocket(httpServer);
    
    httpServer.listen(() => {
      port = httpServer.address().port;
      socketClient = Client(`http://localhost:${port}`, {
        transports: ["websocket"],
        autoConnect: true
      });
      socketClient.on("connect", () => {
        done();
      });
    });
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

  it("should receive 'settings:updated' event", (done) => {
    const settingsData = { TEST: "VALUE" };

    socketClient.on("settings:updated", (data) => {
      expect(data).toEqual(settingsData);
      done();
    });

    emitEvent("settings:updated", settingsData);
  });
});
