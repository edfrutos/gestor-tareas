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

    /// `POST /v1/auth/forgot-password`. Siempre `200`, no revela si el email existe.
    func forgotPassword(email: String) async throws {
        struct Body: Encodable { let email: String }
        _ = try await client.sendVoid(
            .json("POST", "/v1/auth/forgot-password", body: Body(email: email), authorized: false)
        )
    }

    /// `POST /v1/auth/reset-password`. El `token` llega por email (ver
    /// `ResetTokenParsing`), válido 1 h.
    func resetPassword(token: String, password: String) async throws {
        struct Body: Encodable { let token: String; let password: String }
        _ = try await client.sendVoid(
            .json("POST", "/v1/auth/reset-password",
                  body: Body(token: token, password: password), authorized: false)
        )
    }

    /// `GET /v1/auth/me`: datos frescos del usuario autenticado.
    func me() async throws -> SessionUser {
        struct Response: Decodable { let user: SessionUser }
        let response: Response = try await client.send(.init(method: "GET", path: "/v1/auth/me"))
        return response.user
    }

    /// `PATCH /v1/auth/me`: el propio usuario cambia su email y/o contraseña
    /// (distinto de `updateUser`, que es para que un admin edite a otros).
    /// `nil` en cualquier campo significa "no tocar"; el backend solo
    /// devuelve `{ ok: true }`, por eso `me()` se llama después para refrescar.
    func updateMe(email: String?, currentPassword: String?, newPassword: String?) async throws {
        struct Body: Encodable {
            let email: String?
            let currentPassword: String?
            let newPassword: String?
            enum CodingKeys: String, CodingKey { case email, currentPassword, newPassword }
            func encode(to encoder: Encoder) throws {
                var c = encoder.container(keyedBy: CodingKeys.self)
                try c.encodeIfPresent(email, forKey: .email)
                try c.encodeIfPresent(currentPassword, forKey: .currentPassword)
                try c.encodeIfPresent(newPassword, forKey: .newPassword)
            }
        }
        _ = try await client.sendVoid(
            .json("PATCH", "/v1/auth/me",
                  body: Body(email: email, currentPassword: currentPassword, newPassword: newPassword))
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

    // MARK: Notificaciones (Hito 4)

    /// `GET /v1/notifications` → actividad (comentarios/respuestas/cambios) en
    /// tareas creadas o asignadas al usuario, máx. 50, ya ordenada por fecha.
    func notifications() async throws -> [AppNotification] {
        let list: NotificationList = try await client.send(
            .init(method: "GET", path: "/v1/notifications")
        )
        return list.items
    }

    // MARK: Admin — usuarios (Hito 4, requiere role == admin)

    func adminUsers(page: Int, pageSize: Int = 20) async throws -> Paginated<AdminUser> {
        try await client.send(
            .init(method: "GET", path: "/v1/users",
                  query: [
                    URLQueryItem(name: "page", value: String(page)),
                    URLQueryItem(name: "pageSize", value: String(pageSize)),
                  ])
        )
    }

    /// `POST /v1/users`. Devuelve el usuario creado.
    func createUser(username: String, email: String?, password: String, role: String) async throws -> AdminUser {
        struct Body: Encodable {
            let username: String
            let email: String?
            let password: String
            let role: String
        }
        return try await client.send(
            .json("POST", "/v1/users",
                  body: Body(username: username, email: email, password: password, role: role))
        )
    }

    /// `PATCH /v1/users/:id`. Cada parámetro `nil` no se toca; `email` admite
    /// `""` para borrarlo (distinto de no tocarlo, ver `AdminUserEditorViewModel`).
    func updateUser(id: Int, role: String? = nil, email: String? = nil, password: String? = nil) async throws {
        struct Body: Encodable {
            let role: String?
            let email: String?
            let password: String?

            enum CodingKeys: String, CodingKey { case role, email, password }
            func encode(to encoder: Encoder) throws {
                var c = encoder.container(keyedBy: CodingKeys.self)
                try c.encodeIfPresent(role, forKey: .role)
                try c.encodeIfPresent(email, forKey: .email)
                try c.encodeIfPresent(password, forKey: .password)
            }
        }
        _ = try await client.sendVoid(
            .json("PATCH", "/v1/users/\(id)", body: Body(role: role, email: email, password: password))
        )
    }

    /// `DELETE /v1/users/:id`. `400` si es el propio usuario autenticado.
    func deleteUser(id: Int) async throws {
        _ = try await client.sendVoid(.init(method: "DELETE", path: "/v1/users/\(id)"))
    }

    // MARK: Admin — settings en caliente (Hito 4, requiere role == admin)

    func settings() async throws -> AppRuntimeSettings {
        try await client.send(.init(method: "GET", path: "/v1/settings"))
    }

    /// `PATCH /v1/settings`. Emite `settings:updated` (Socket.io) al aplicarse.
    /// Devuelve el conjunto completo ya actualizado.
    func updateSettings(_ patch: SettingsPatch) async throws -> AppRuntimeSettings {
        try await client.send(.json("PATCH", "/v1/settings", body: patch))
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
