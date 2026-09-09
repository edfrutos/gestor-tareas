import Foundation

/// Fachada tipada sobre `APIClient` con los endpoints que usa la app.
/// Se crea de forma efímera desde un contexto `@MainActor` (view models).
@MainActor
struct GestorAPI {
    private let client: APIClient

    init(settings: AppSettings, session: SessionStore) {
        self.client = APIClient(baseURL: settings.baseURL, tokenProvider: session)
    }

    // MARK: Auth

    func login(username: String, password: String) async throws -> LoginResponse {
        struct Body: Encodable {
            let username: String
            let password: String
        }
        return try await client.send(
            .json("POST", "/v1/auth/login",
                  body: Body(username: username, password: password),
                  authorized: false)
        )
    }

    // MARK: Issues

    func issues(filter: IssueFilter, page: Int) async throws -> Paginated<Issue> {
        try await client.send(
            .init(method: "GET", path: "/v1/issues", query: filter.queryItems(page: page))
        )
    }

    func issue(id: Int) async throws -> Issue {
        try await client.send(.init(method: "GET", path: "/v1/issues/\(id)"))
    }

    func logs(issueID: Int) async throws -> [IssueLog] {
        try await client.send(.init(method: "GET", path: "/v1/issues/\(issueID)/logs"))
    }

    func comments(issueID: Int) async throws -> [Comment] {
        try await client.send(.init(method: "GET", path: "/v1/issues/\(issueID)/comments"))
    }

    func categories() async throws -> [String] {
        try await client.send(.init(method: "GET", path: "/v1/issues/categories"))
    }

    // MARK: Estadísticas

    func stats() async throws -> IssueStats {
        try await client.send(.init(method: "GET", path: "/v1/issues/stats"))
    }

    func statsDetails() async throws -> StatsDetails {
        try await client.send(.init(method: "GET", path: "/v1/issues/stats/details"))
    }

    // MARK: Salud

    /// `true` solo si el servidor responde 2xx con `ok == true`. Cualquier fallo → `false`.
    func health() async -> Bool {
        do {
            let status: HealthStatus = try await client.send(
                .init(method: "GET", path: "/health", authorized: false)
            )
            return status.ok
        } catch {
            return false
        }
    }
}
