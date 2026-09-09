import SwiftUI

/// Punto verde/rojo en la barra de herramientas: sondea `GET /health` cada 30 s.
struct ConnectionIndicator: View {
    @Environment(SessionStore.self) private var session
    @Environment(AppSettings.self) private var settings
    @State private var online: Bool?

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
        .task(id: settings.serverURLString) {
            while !Task.isCancelled {
                online = await GestorAPI(settings: settings, session: session).health()
                try? await Task.sleep(for: .seconds(30))
            }
        }
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
