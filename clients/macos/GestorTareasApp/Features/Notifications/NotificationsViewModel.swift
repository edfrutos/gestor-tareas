import Foundation
import Observation

@MainActor
@Observable
final class NotificationsViewModel {
    var items: [AppNotification] = []
    var isLoading = false
    var errorMessage: String?

    /// Sondeo cada 30 s mientras la pestaña esté visible (no hay evento
    /// realtime de notificaciones todavía, ver `docs/PLAN_APP_MACOS.md`
    /// Hito 4). Se cancela solo: `NotificationsView` la monta con `.task`, que
    /// SwiftUI cancela al cambiar de pestaña.
    func startPolling(settings: AppSettings, session: SessionStore) async {
        while !Task.isCancelled {
            await load(settings: settings, session: session)
            try? await Task.sleep(for: .seconds(30))
        }
    }

    func load(settings: AppSettings, session: SessionStore) async {
        isLoading = items.isEmpty
        defer { isLoading = false }

        let api = GestorAPI(settings: settings, session: session)
        do {
            items = try await api.notifications()
            errorMessage = nil
        } catch let error as APIError {
            errorMessage = error.message
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
