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

    func issues(filter: IssueFilter, page: Int, pageSize: Int = 50) async throws -> Paginated<Issue> {
        try await client.send(
            .init(method: "GET", path: "/v1/issues",
                  query: filter.queryItems(page: page, pageSize: pageSize))
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

    // MARK: Escritura de tareas (Hito 2)

    /// `POST /v1/issues` (multipart). Devuelve la tarea creada.
    func createIssue(_ draft: IssueDraft) async throws -> Issue {
        try await client.send(
            .multipart("POST", "/v1/issues", form: draft.makeCreateForm())
        )
    }

    /// `PATCH /v1/issues/:id` (multipart) con un formulario ya reducido a los
    /// campos que cambian (ver `IssueDraft.makeUpdateForm`). Devuelve la tarea
    /// actualizada.
    func updateIssue(id: Int, form: MultipartForm) async throws -> Issue {
        try await client.send(
            .multipart("PATCH", "/v1/issues/\(id)", form: form)
        )
    }

    // MARK: Comentarios (Hito 2)

    /// `POST /v1/issues/:id/comments` (JSON). `parentID` para responder a un hilo.
    /// Devuelve el comentario recién creado (`replies: []`).
    func addComment(issueID: Int, text: String, parentID: Int?) async throws -> Comment {
        struct Body: Encodable {
            let text: String
            let parentID: Int?
            enum CodingKeys: String, CodingKey {
                case text
                case parentID = "parent_id"
            }
            func encode(to encoder: Encoder) throws {
                var c = encoder.container(keyedBy: CodingKeys.self)
                try c.encode(text, forKey: .text)
                try c.encodeIfPresent(parentID, forKey: .parentID)
            }
        }
        return try await client.send(
            .json("POST", "/v1/issues/\(issueID)/comments",
                  body: Body(text: text, parentID: parentID))
        )
    }

    // MARK: Datos de referencia (selectores del editor y de los filtros)

    /// `GET /v1/users/for-assign` → `{ items: [{ id, username }] }`.
    func usersForAssign() async throws -> [UserRef] {
        let page: Paginated<UserRef> = try await client.send(
            .init(method: "GET", path: "/v1/users/for-assign")
        )
        return page.items
    }

    /// `GET /v1/maps?exclude_layers=true` → array plano de planos de primer nivel.
    func maps() async throws -> [MapRef] {
        try await client.send(
            .init(method: "GET", path: "/v1/maps",
                  query: [URLQueryItem(name: "exclude_layers", value: "true")])
        )
    }

    // MARK: Plano (Hito 3)

    /// `GET /v1/maps/:id` → plano + `layers` (capas técnicas anidadas).
    func mapDetail(id: Int) async throws -> MapDetail {
        try await client.send(.init(method: "GET", path: "/v1/maps/\(id)"))
    }

    /// `GET /v1/maps/:mapId/zones` → zonas dibujadas sobre el plano.
    func zones(mapID: Int) async throws -> [MapZone] {
        try await client.send(.init(method: "GET", path: "/v1/maps/\(mapID)/zones"))
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
