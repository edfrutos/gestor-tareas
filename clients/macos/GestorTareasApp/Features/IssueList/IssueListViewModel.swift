import Foundation
import Observation

@MainActor
@Observable
final class IssueListViewModel {
    var issues: [Issue] = []
    var filter = IssueFilter()
    var categories: [String] = []
    var total = 0
    var isLoading = false
    var isLoadingMore = false
    var errorMessage: String?

    private var page = 1
    private let pageSize = 50

    var canLoadMore: Bool { issues.count < total }

    func firstLoad(settings: AppSettings, session: SessionStore) async {
        if categories.isEmpty {
            let api = GestorAPI(settings: settings, session: session)
            categories = (try? await api.categories()) ?? []
        }
        if issues.isEmpty {
            await reload(settings: settings, session: session)
        }
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
