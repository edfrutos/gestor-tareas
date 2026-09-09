import SwiftUI

struct MainView: View {
    @Environment(SessionStore.self) private var session
    @State private var selection: Panel? = .issues

    enum Panel: String, CaseIterable, Identifiable {
        case issues = "Tareas"
        case stats = "Estadísticas"
        case notifications = "Notificaciones"

        var id: String { rawValue }

        var systemImage: String {
            switch self {
            case .issues: return "list.bullet.clipboard"
            case .stats: return "chart.bar"
            case .notifications: return "bell"
            }
        }
    }

    var body: some View {
        NavigationSplitView {
            List(Panel.allCases, selection: $selection) { panel in
                Label(panel.rawValue, systemImage: panel.systemImage)
                    .tag(panel)
            }
            .navigationSplitViewColumnWidth(min: 190, ideal: 210, max: 260)
        } detail: {
            NavigationStack {
                panelView
                    .navigationDestination(for: Int.self) { issueID in
                        IssueDetailView(issueID: issueID)
                    }
            }
        }
        .toolbar {
            ToolbarItem(placement: .status) {
                ConnectionIndicator()
            }
            ToolbarItem(placement: .primaryAction) {
                accountMenu
            }
        }
    }

    @ViewBuilder
    private var panelView: some View {
        switch selection ?? .issues {
        case .issues:
            IssueListView()
        case .stats:
            StatsView()
        case .notifications:
            ContentUnavailableView("Notificaciones",
                                   systemImage: "bell",
                                   description: Text("Disponible en el Hito 4."))
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
