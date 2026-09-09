import Foundation
import Observation

struct CategoryCount: Identifiable {
    let label: String
    let count: Int
    var id: String { label }
}

struct StatusSlice: Identifiable {
    let label: String
    let count: Int
    var id: String { label }
}

@MainActor
@Observable
final class StatsViewModel {
    var stats = IssueStats()
    var details = StatsDetails()
    var isLoading = false
    var errorMessage: String?

    func load(settings: AppSettings, session: SessionStore) async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        let api = GestorAPI(settings: settings, session: session)
        do {
            async let statsRequest = api.stats()
            async let detailsRequest = api.statsDetails()
            stats = try await statsRequest
            details = try await detailsRequest
        } catch let error as APIError {
            errorMessage = error.message
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    var categoriesSorted: [CategoryCount] {
        details.byCategory
            .map { CategoryCount(label: $0.key, count: $0.value) }
            .sorted { $0.count > $1.count }
    }

    var statusSlices: [StatusSlice] {
        [
            StatusSlice(label: "Abiertas", count: details.byStatus["open"] ?? stats.open),
            StatusSlice(label: "En proceso", count: details.byStatus["in_progress"] ?? stats.inProgress),
            StatusSlice(label: "Resueltas", count: details.byStatus["resolved"] ?? stats.resolved),
        ].filter { $0.count > 0 }
    }
}
