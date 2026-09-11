import SwiftUI

/// Panel admin: usuarios (CRUD) y settings en caliente. `MainView` solo
/// muestra la pestaña con `session.isAdmin`; se repite la comprobación aquí
/// por si algún día se llega por otra vía (deep-link, etc.).
struct AdminView: View {
    @Environment(SessionStore.self) private var session

    /// Nombrado `Tab` (no `Section`) a propósito: no chocar con `SwiftUI.Section`.
    private enum Tab: String, CaseIterable, Identifiable {
        case users = "Usuarios"
        case settings = "Configuración"
        var id: String { rawValue }
    }

    @State private var tab: Tab = .users

    var body: some View {
        Group {
            if session.isAdmin {
                VStack(spacing: 0) {
                    Picker("", selection: $tab) {
                        ForEach(Tab.allCases) { Text($0.rawValue).tag($0) }
                    }
                    .pickerStyle(.segmented)
                    .labelsHidden()
                    .padding(10)
                    Divider()

                    switch tab {
                    case .users: AdminUsersView()
                    case .settings: AdminSettingsView()
                    }
                }
            } else {
                ContentUnavailableView("Acceso restringido",
                                       systemImage: "lock",
                                       description: Text("Solo para administradores."))
            }
        }
        .navigationTitle("Administración")
    }
}
