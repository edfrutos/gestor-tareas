import SwiftUI

struct MainView: View {
    @Environment(SessionStore.self) private var session
    @Environment(AppSettings.self) private var settings
    @Environment(SocketClient.self) private var socket
    @Environment(DeepLinkRouter.self) private var router

    @State private var selection: Panel? = .issues
    @State private var path = NavigationPath()
    @State private var showProfile = false

    enum Panel: String, CaseIterable, Identifiable {
        case issues = "Tareas"
        case plan = "Plano"
        case stats = "Estadísticas"
        case notifications = "Notificaciones"
        case admin = "Administración"

        var id: String { rawValue }

        var systemImage: String {
            switch self {
            case .issues: return "list.bullet.clipboard"
            case .plan: return "map"
            case .stats: return "chart.bar"
            case .notifications: return "bell"
            case .admin: return "gearshape.2"
            }
        }
    }

    /// `.admin` solo se ofrece con `role == admin` (Hito 4).
    private var visiblePanels: [Panel] {
        session.isAdmin ? Panel.allCases : Panel.allCases.filter { $0 != .admin }
    }

    var body: some View {
        NavigationSplitView {
            List(visiblePanels, selection: $selection) { panel in
                Label(panel.rawValue, systemImage: panel.systemImage)
                    .tag(panel)
            }
            .navigationSplitViewColumnWidth(min: 190, ideal: 210, max: 260)
        } detail: {
            NavigationStack(path: $path) {
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
        // Tiempo real (Hito 3): se conecta mientras haya sesión (MainView solo
        // existe cuando `session.state == .signedIn`, ver RootView) y se
        // reconecta si cambia la URL del servidor en Preferencias.
        .task(id: settings.serverURLString) {
            socket.connect(baseURL: settings.baseURL)
        }
        .onDisappear { socket.disconnect() }
        .task { openPendingDeepLink() }
        .onChange(of: router.pendingIssueID) { openPendingDeepLink() }
        .sheet(isPresented: $showProfile) {
            if let user = session.currentUser {
                ProfileView(user: user)
                    .environment(session)
                    .environment(settings)
            }
        }
    }

    @ViewBuilder
    private var panelView: some View {
        switch selection ?? .issues {
        case .issues:
            IssueListView()
        case .plan:
            PlanView()
        case .stats:
            StatsView()
        case .notifications:
            NotificationsView()
        case .admin:
            AdminView()
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
            Button("Editar perfil…") { showProfile = true }
            Divider()
            Button("Cerrar sesión", role: .destructive) {
                session.signOut()
            }
        } label: {
            HStack(spacing: 6) {
                accountAvatar
                Text(session.currentUser?.username ?? "Cuenta")
            }
        }
    }

    @ViewBuilder
    private var accountAvatar: some View {
        if let url = settings.mediaURL(session.currentUser?.avatarThumbURL) {
            AsyncImage(url: url) { phase in
                switch phase {
                case .success(let image):
                    image.resizable().scaledToFill()
                default:
                    Image(systemName: "person.circle")
                }
            }
            .frame(width: 18, height: 18)
            .clipShape(Circle())
        } else {
            Image(systemName: "person.circle")
        }
    }

    /// Abre la tarea pendiente de un deep-link (`gestortareas://issue/<id>`),
    /// llegado antes o después de iniciar sesión.
    private func openPendingDeepLink() {
        guard let id = router.pendingIssueID else { return }
        selection = .issues
        path.append(id)
        router.pendingIssueID = nil
    }
}
