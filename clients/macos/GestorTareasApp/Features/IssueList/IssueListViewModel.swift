import Foundation
import Observation

@MainActor
@Observable
final class IssueListViewModel {
    var issues: [Issue] = []
    var filter = IssueFilter()
    var categories: [String] = []
    var assignees: [UserRef] = []
    var maps: [MapRef] = []
    var total = 0
    var isLoading = false
    var isLoadingMore = false
    var errorMessage: String?

    private var page = 1
    private let pageSize = 50

    var canLoadMore: Bool { issues.count < total }

    func firstLoad(settings: AppSettings, session: SessionStore) async {
        let api = GestorAPI(settings: settings, session: session)
        if categories.isEmpty {
            categories = (try? await api.categories()) ?? []
        }
        if assignees.isEmpty {
            assignees = (try? await api.usersForAssign()) ?? []
        }
        if maps.isEmpty {
            maps = ((try? await api.maps()) ?? []).filter { $0.parentID == nil }
        }
        if issues.isEmpty {
            await reload(settings: settings, session: session)
        }
    }

    /// Inserta al principio una tarea recién creada desde el editor (feedback
    /// inmediato; una recarga posterior reconcilia con los filtros del servidor).
    func insertCreated(_ issue: Issue) {
        guard !issues.contains(where: { $0.id == issue.id }) else { return }
        issues.insert(issue, at: 0)
        total += 1
    }

    func reload(settings: AppSettings, session: SessionStore) async {
        page = 1
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        let api = GestorAPI(settings: settings, session: session)
        do {
            let result = try await api.issues(filter: filter, page: 1)
            issues = result.items
            total = result.total ?? result.items.count
        } catch let error as APIError {
            errorMessage = error.message
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func loadMoreIfNeeded(current item: Issue,
                          settings: AppSettings,
                          session: SessionStore) async {
        guard let last = issues.last, last.id == item.id else { return }
        await loadMore(settings: settings, session: session)
    }

    func loadMore(settings: AppSettings, session: SessionStore) async {
        guard canLoadMore, !isLoading, !isLoadingMore else { return }
        isLoadingMore = true
        defer { isLoadingMore = false }

        let next = page + 1
        let api = GestorAPI(settings: settings, session: session)
        do {
            let result = try await api.issues(filter: filter, page: next)
            let known = Set(issues.map(\.id))
            issues.append(contentsOf: result.items.filter { !known.contains($0.id) })
            total = result.total ?? total
            page = next
        } catch let error as APIError {
            errorMessage = error.message
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
