import SwiftUI

struct MainView: View {
    @Environment(SessionStore.self) private var session
    @State private var selection: Panel? = .issues

    enum Panel: String, CaseIterable, Identifiable {
        case issues = "Tareas"
        case notifications = "Notificaciones"
        case stats = "Estadísticas"

        var id: String { rawValue }

        var systemImage: String {
            switch self {
            case .issues: return "list.bullet.clipboard"
            case .notifications: return "bell"
            case .stats: return "chart.bar"
            }
        }
    }

    var body: some View {
        NavigationSplitView {
            List(Panel.allCases, selection: $selection) { panel in
                Label(panel.rawValue, systemImage: panel.systemImage)
                    .tag(panel)
            }
            .navigationSplitViewColumnWidth(min: 180, ideal: 200, max: 260)
        } detail: {
            detail
        }
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                accountMenu
            }
        }
    }

    @ViewBuilder
    private var detail: some View {
        switch selection ?? .issues {
        case .issues:
            IssueListView()
        case .notifications:
            ContentUnavailableView("Notificaciones",
                                   systemImage: "bell",
                                   description: Text("Disponible en el Hito 4."))
        case .stats:
            ContentUnavailableView("Estadísticas",
                                   systemImage: "chart.bar",
                                   description: Text("Disponible en el Hito 1."))
        }
    }

    private var accountMenu: some View {
        Menu {
            if let user = session.currentUser {
                Text(user.username)
                if let email = user.email { Text(email) }
                if user.isAdmin { Text("Administrador") }
            }
            Divider()
            Button("Cerrar sesión", role: .destructive) {
                session.signOut()
            }
        } label: {
            Label(session.currentUser?.username ?? "Cuenta", systemImage: "person.circle")
        }
    }
}
