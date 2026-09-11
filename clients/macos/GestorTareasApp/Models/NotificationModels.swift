import Foundation

// MARK: - Notificaciones  (GET /v1/notifications, Hito 4)

/// Actividad en tareas creadas o asignadas al usuario actual (comentarios,
/// respuestas y cambios de estado/prioridad/asignación/...). El backend no da
/// un `id` propio — combina `src/routes/notifications.routes.js`: dos formas
/// distintas de entrada según `type`, ya mezcladas y ordenadas por fecha.
struct AppNotification: Codable, Identifiable, Equatable {
    enum Kind: String, Codable {
        case comment, reply, log
    }

    let type: Kind
    let issueID: Int
    let issueTitle: String
    let createdAt: String

    // `type == .comment || .reply`
    let commenterUsername: String?
    let textPreview: String?

    // `type == .log`
    let action: String?
    let oldValue: String?
    let newValue: String?

    enum CodingKeys: String, CodingKey {
        case type
        case issueID = "issue_id"
        case issueTitle = "issue_title"
        case createdAt = "created_at"
        case commenterUsername = "commenter_username"
        case textPreview = "text_preview"
        case action
        case oldValue = "old_value"
        case newValue = "new_value"
    }

    /// Sintético: el backend no manda un `id` de fila único para esta lista
    /// combinada, así que se compone con lo que sí la identifica de forma
    /// estable entre sondeos consecutivos.
    var id: String {
        "\(type.rawValue)-\(issueID)-\(createdAt)-\(action ?? textPreview ?? "")"
    }

    var actionLabel: String? { action.map(IssueLog.label(forAction:)) }
}

struct NotificationList: Codable {
    let items: [AppNotification]
}
