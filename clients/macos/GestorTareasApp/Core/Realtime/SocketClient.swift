import Foundation
import Observation
import SocketIO

/// Los tres eventos de `issues` (más `settings:updated`, ver `docs/API.md §4`).
/// El backend emite a todos los clientes conectados (`io.emit`), así que
/// cualquier sesión ve los eventos de cualquier usuario — pero desde que el
/// handshake exige JWT (`socket.service.js::authenticateSocket`), al menos
/// hace falta estar autenticado; se sigue filtrando donde haga falta (p. ej.
/// por `issue.id` en el detalle).
enum IssueRealtimeEvent: Equatable {
    case created(Issue)
    case updated(Issue)
    case deleted(id: Int)
    case settingsUpdated
}

/// Envoltorio con id único para que `.task(id:)`/`.onChange` disparen en cada
/// evento nuevo, incluso si dos payloads seguidos son iguales.
struct SocketEvent: Identifiable {
    let id = UUID()
    let payload: IssueRealtimeEvent
}

/// Cliente de Socket.io (protocolo EIO4, namespace por defecto). Se conecta una
/// vez por `baseURL` y publica cada evento en `lastEvent`; las vistas
/// (`IssueListView`, `IssueDetailView`, `PlanView`) observan ese valor con
/// `.task(id: socket.lastEvent?.id)` y aplican el cambio a su propio estado.
@MainActor
@Observable
final class SocketClient {
    private(set) var isConnected = false
    private(set) var lastEvent: SocketEvent?

    private var manager: SocketManager?
    private var socket: SocketIOClient?
    private var connectedURL: URL?

    func connect(baseURL: URL?, token: String?) {
        guard let baseURL else {
            disconnect()
            return
        }
        guard connectedURL != baseURL else { return }
        disconnect()

        // El handshake exige JWT (`socket.service.js::authenticateSocket`); sin
        // `connectParams` el servidor rechaza la conexión con "unauthorized".
        var config: SocketIOClientConfiguration = [.log(false), .compress, .reconnects(true)]
        if let token, !token.isEmpty {
            config.insert(.connectParams(["token": token]))
        }
        let manager = SocketManager(socketURL: baseURL, config: config)
        let socket = manager.defaultSocket

        socket.on(clientEvent: .connect) { [weak self] _, _ in
            Task { @MainActor in self?.isConnected = true }
        }
        socket.on(clientEvent: .disconnect) { [weak self] _, _ in
            Task { @MainActor in self?.isConnected = false }
        }
        socket.on(clientEvent: .error) { data, _ in
            print("[SocketClient] error:", data)
        }
        socket.on("issue:created") { [weak self] data, _ in
            guard let issue: Issue = Self.decode(data.first) else { return }
            Task { @MainActor in self?.publish(.created(issue)) }
        }
        socket.on("issue:updated") { [weak self] data, _ in
            guard let issue: Issue = Self.decode(data.first) else { return }
            Task { @MainActor in self?.publish(.updated(issue)) }
        }
        socket.on("issue:deleted") { [weak self] data, _ in
            guard let id = Self.deletedID(from: data.first) else { return }
            Task { @MainActor in self?.publish(.deleted(id: id)) }
        }
        socket.on("settings:updated") { [weak self] _, _ in
            Task { @MainActor in self?.publish(.settingsUpdated) }
        }

        self.manager = manager
        self.socket = socket
        connectedURL = baseURL
        socket.connect()
    }

    func disconnect() {
        socket?.disconnect()
        manager = nil
        socket = nil
        connectedURL = nil
        isConnected = false
    }

    private func publish(_ event: IssueRealtimeEvent) {
        lastEvent = SocketEvent(payload: event)
    }

    // MARK: Decodificación de payloads — puro, sin aislamiento de actor, para
    // poder llamarlo tanto desde la cola interna de SocketIO como desde tests.

    nonisolated static func decode<T: Decodable>(_ payload: Any?) -> T? {
        guard let payload, JSONSerialization.isValidJSONObject(payload) || payload is NSArray,
              let data = try? JSONSerialization.data(withJSONObject: payload) else { return nil }
        return try? JSONDecoder().decode(T.self, from: data)
    }

    nonisolated static func deletedID(from payload: Any?) -> Int? {
        guard let dict = payload as? [String: Any] else { return nil }
        if let id = dict["id"] as? Int { return id }
        if let id = dict["id"] as? Double { return Int(id) }
        if let s = dict["id"] as? String { return Int(s) }
        return nil
    }
}
