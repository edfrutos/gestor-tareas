import Foundation
import Observation

@MainActor
@Observable
final class IssueListViewModel {
    var issues: [Issue] = []
    var isLoading = false
    var errorMessage: String?

    func load(settings: AppSettings, session: SessionStore) async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        let client = APIClient(baseURL: settings.baseURL, tokenProvider: session)
        let request = APIClient.Request(
            method: "GET",
            path: "/v1/issues",
            query: [
                URLQueryItem(name: "pageSize", value: "100"),
                URLQueryItem(name: "order", value: "new")
            ]
        )

        do {
            let page: Paginated<Issue> = try await client.send(request)
            issues = page.items
        } catch let error as APIError {
            errorMessage = error.message
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
