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

    /// Estado del compositor de comentarios / respuestas (Hito 2).
    var isPostingComment = false
    var commentError: String?

    private var issueID: Int?

    func load(id: Int, settings: AppSettings, session: SessionStore) async {
        issueID = id
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

    /// Aplica la tarea recién editada y refresca historial y comentarios.
    func apply(updated: Issue, settings: AppSettings, session: SessionStore) async {
        issue = updated
        let api = GestorAPI(settings: settings, session: session)
        logs = (try? await api.logs(issueID: updated.id)) ?? logs
        comments = (try? await api.comments(issueID: updated.id)) ?? comments
    }

    /// Publica un comentario (o una respuesta si `parentID != nil`) y recarga el árbol.
    func postComment(text: String,
                     parentID: Int?,
                     settings: AppSettings,
                     session: SessionStore) async -> Bool {
        guard let issueID else { return false }
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return false }

        isPostingComment = true
        commentError = nil
        defer { isPostingComment = false }

        let api = GestorAPI(settings: settings, session: session)
        do {
            _ = try await api.addComment(issueID: issueID, text: trimmed, parentID: parentID)
            comments = (try? await api.comments(issueID: issueID)) ?? comments
            return true
        } catch let error as APIError {
            commentError = error.message
            return false
        } catch {
            commentError = error.localizedDescription
            return false
        }
    }
}
