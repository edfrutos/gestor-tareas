import Foundation
import Observation

@MainActor
@Observable
final class AdminUsersViewModel {
    var users: [AdminUser] = []
    var total = 0
    var isLoading = false
    var isLoadingMore = false
    var errorMessage: String?

    private var page = 1
    private let pageSize = 20

    var canLoadMore: Bool { users.count < total }

    func firstLoad(settings: AppSettings, session: SessionStore) async {
        guard users.isEmpty else { return }
        await reload(settings: settings, session: session)
    }

    func reload(settings: AppSettings, session: SessionStore) async {
        page = 1
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        let api = GestorAPI(settings: settings, session: session)
        do {
            let result = try await api.adminUsers(page: 1, pageSize: pageSize)
            users = result.items
            total = result.total ?? result.items.count
        } catch let error as APIError {
            errorMessage = error.message
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func loadMoreIfNeeded(current user: AdminUser, settings: AppSettings, session: SessionStore) async {
        guard let last = users.last, last.id == user.id else { return }
        await loadMore(settings: settings, session: session)
    }

    func loadMore(settings: AppSettings, session: SessionStore) async {
        guard canLoadMore, !isLoading, !isLoadingMore else { return }
        isLoadingMore = true
        defer { isLoadingMore = false }

        let next = page + 1
        let api = GestorAPI(settings: settings, session: session)
        do {
            let result = try await api.adminUsers(page: next, pageSize: pageSize)
            let known = Set(users.map(\.id))
            users.append(contentsOf: result.items.filter { !known.contains($0.id) })
            total = result.total ?? total
            page = next
        } catch let error as APIError {
            errorMessage = error.message
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// Inserta/reemplaza tras crear o editar desde `AdminUserEditorView`.
    func apply(_ user: AdminUser) {
        if let index = users.firstIndex(where: { $0.id == user.id }) {
            users[index] = user
        } else {
            users.insert(user, at: 0)
            total += 1
        }
    }

    /// `true` si se borró. El backend rechaza que un admin se borre a sí mismo (`400`).
    func delete(_ user: AdminUser, settings: AppSettings, session: SessionStore) async -> Bool {
        errorMessage = nil
        let api = GestorAPI(settings: settings, session: session)
        do {
            try await api.deleteUser(id: user.id)
            users.removeAll { $0.id == user.id }
            total = max(0, total - 1)
            return true
        } catch let error as APIError {
            errorMessage = error.message
            return false
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }
}
