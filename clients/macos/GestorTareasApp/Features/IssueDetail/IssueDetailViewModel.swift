import Foundation
import Observation

@MainActor
@Observable
final class IssueDetailViewModel {
    var issue: Issue?
    var logs: [IssueLog] = []
    var comments: [Comment] = []
    var isLoading = false
    var errorMessage: String?

    func load(id: Int, settings: AppSettings, session: SessionStore) async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        let api = GestorAPI(settings: settings, session: session)
        do {
            async let issueRequest = api.issue(id: id)
            async let logsRequest = api.logs(issueID: id)
            async let commentsRequest = api.comments(issueID: id)

            issue = try await issueRequest
            logs = (try? await logsRequest) ?? []
            comments = (try? await commentsRequest) ?? []
        } catch let error as APIError {
            errorMessage = error.message
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
