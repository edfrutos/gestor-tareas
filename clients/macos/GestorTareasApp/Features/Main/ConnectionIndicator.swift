import SwiftUI
import Observation
import OSLog

/// Sondea `GET /health` cada 30 s con una tarea propia, independiente del
/// ciclo de vida de la vista (un `.task` dentro del toolbar se cancelaba al
/// recomponerse y marcaba "Sin conexión" sin llegar a enviar la petición).
@MainActor
@Observable
final class ConnectionMonitor {
    private(set) var online: Bool?

    @ObservationIgnored private var loop: Task<Void, Never>?
    @ObservationIgnored private let log = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "GestorTareas",
        category: "health"
    )

    func start(settings: AppSettings, session: SessionStore) {
        loop?.cancel()
        online = nil
        loop = Task { [weak self] in
            while !Task.isCancelled {
                let ok = await GestorAPI(settings: settings, session: session).health()
                // Si nos cancelan a mitad de petición, no es un fallo de red.
                if Task.isCancelled { return }
                self?.log.debug("health -> \(ok, privacy: .public)")
                self?.online = ok
                try? await Task.sleep(for: .seconds(30))
            }
        }
    }

    func stop() {
        loop?.cancel()
        loop = nil
    }
}

/// Punto verde/rojo en la barra de herramientas. Solo pinta el estado que le
/// pasa `MainView` (a través de `ConnectionMonitor`).
struct ConnectionIndicator: View {
    @Environment(AppSettings.self) private var settings
    let online: Bool?

    var body: some View {
        HStack(spacing: 5) {
            Circle()
                .fill(color)
                .frame(width: 8, height: 8)
            Text(label)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .help("Conexión con \(settings.serverURLString)")
    }

    private var color: Color {
        switch online {
        case .some(true): return .green
        case .some(false): return .red
        case .none: return .gray
        }
    }

    private var label: String {
        switch online {
        case .some(true): return "En línea"
        case .some(false): return "Sin conexión"
        case .none: return "Comprobando…"
        }
    }
}