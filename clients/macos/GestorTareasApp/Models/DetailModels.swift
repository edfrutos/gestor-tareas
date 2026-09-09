import Foundation

// MARK: - Historial de auditoría  (GET /v1/issues/:id/logs)

struct IssueLog: Codable, Identifiable {
    let id: Int
    let issueID: Int
    let userID: Int?
    let action: String
    let oldValue: String?
    let newValue: String?
    let createdAt: String

    enum CodingKeys: String, CodingKey {
        case id, action
        case issueID = "issue_id"
        case userID = "user_id"
        case oldValue = "old_value"
        case newValue = "new_value"
        case createdAt = "created_at"
    }

    var actionLabel: String {
        switch action {
        case "create": return "Creación"
        case "update_status", "status": return "Cambio de estado"
        case "assign": return "Asignación"
        case "update_priority": return "Cambio de prioridad"
        case "update_due_date": return "Fecha límite"
        case "update_category": return "Cambio de categoría"
        case "update_map", "update_map_id": return "Cambio de plano"
        default: return action
        }
    }
}

// MARK: - Comentarios en árbol  (GET /v1/issues/:id/comments)

struct Comment: Codable, Identifiable {
    let id: Int
    let issueID: Int
    let userID: Int
    let username: String?
    let parentID: Int?
    let text: String
    let createdAt: String
    let replies: [Comment]

    enum CodingKeys: String, CodingKey {
        case id, username, text, replies
        case issueID = "issue_id"
        case userID = "user_id"
        case parentID = "parent_id"
        case createdAt = "created_at"
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(Int.self, forKey: .id)
        issueID = try c.decodeIfPresent(Int.self, forKey: .issueID) ?? 0
        userID = try c.decodeIfPresent(Int.self, forKey: .userID) ?? 0
        username = try c.decodeIfPresent(String.self, forKey: .username)
        parentID = try c.decodeIfPresent(Int.self, forKey: .parentID)
        text = try c.decode(String.self, forKey: .text)
        createdAt = try c.decodeIfPresent(String.self, forKey: .createdAt) ?? ""
        replies = try c.decodeIfPresent([Comment].self, forKey: .replies) ?? []
    }

    var displayName: String { username ?? "usuario \(userID)" }
}

// MARK: - Estadísticas  (GET /v1/issues/stats)

struct IssueStats: Codable {
    var open = 0
    var inProgress = 0
    var resolved = 0
    var total = 0

    enum CodingKeys: String, CodingKey {
        case open, resolved, total
        case inProgress = "in_progress"
    }

    init() {}

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        open = try c.decodeIfPresent(Int.self, forKey: .open) ?? 0
        inProgress = try c.decodeIfPresent(Int.self, forKey: .inProgress) ?? 0
        resolved = try c.decodeIfPresent(Int.self, forKey: .resolved) ?? 0
        total = try c.decodeIfPresent(Int.self, forKey: .total) ?? 0
    }
}

// MARK: - Estadísticas detalladas  (GET /v1/issues/stats/details)

struct UserCount: Codable, Identifiable {
    let username: String
    let count: Int
    var id: String { username }
}

struct StatsDetails: Codable {
    var byStatus: [String: Int] = [:]
    var byCategory: [String: Int] = [:]
    var byUser: [UserCount] = []

    enum CodingKeys: String, CodingKey {
        case byStatus, byCategory, byUser
    }

    init() {}

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        byStatus = try c.decodeIfPresent([String: Int].self, forKey: .byStatus) ?? [:]
        byCategory = try c.decodeIfPresent([String: Int].self, forKey: .byCategory) ?? [:]
        byUser = try c.decodeIfPresent([UserCount].self, forKey: .byUser) ?? []
    }
}

// MARK: - Salud del servidor  (GET /health)

struct HealthStatus: Codable {
    let ok: Bool
    let uptimeSec: Int?
    let latencyMs: Int?
}
