import Foundation

// MARK: - Sesión / usuario

struct SessionUser: Codable, Equatable, Identifiable {
    let id: Int
    let username: String
    let email: String?
    let role: String

    var isAdmin: Bool { role == "admin" }
}

struct LoginResponse: Codable {
    let token: String
    let user: SessionUser
}

/// Referencia mínima de usuario (`GET /v1/users/for-assign`).
struct UserRef: Codable, Identifiable, Hashable {
    let id: Int
    let username: String
}

// MARK: - Enumeraciones de negocio

enum IssueStatus: String, Codable, CaseIterable, Identifiable {
    case open
    case inProgress = "in_progress"
    case resolved

    var id: String { rawValue }

    var label: String {
        switch self {
        case .open: return "Abierta"
        case .inProgress: return "En proceso"
        case .resolved: return "Resuelta"
        }
    }
}

enum Priority: String, Codable, CaseIterable, Identifiable {
    case low, medium, high, critical

    var id: String { rawValue }

    var label: String {
        switch self {
        case .low: return "Baja"
        case .medium: return "Media"
        case .high: return "Alta"
        case .critical: return "Crítica"
        }
    }
}

// MARK: - Issue

struct Issue: Codable, Identifiable, Hashable {
    let id: Int
    var title: String
    var category: String
    var description: String
    var lat: Double?
    var lng: Double?
    var photoURL: String?
    var thumbURL: String?
    var textURL: String?
    var resolutionPhotoURL: String?
    var resolutionThumbURL: String?
    var resolutionTextURL: String?
    var status: IssueStatus
    var priority: Priority
    var dueDate: String?
    var createdAt: String
    var createdBy: Int?
    var createdByUsername: String?
    var mapID: Int?
    var assignedTo: Int?
    var assignedToUsername: String?

    enum CodingKeys: String, CodingKey {
        case id, title, category, description, lat, lng, status, priority
        case photoURL = "photo_url"
        case thumbURL = "thumb_url"
        case textURL = "text_url"
        case resolutionPhotoURL = "resolution_photo_url"
        case resolutionThumbURL = "resolution_thumb_url"
        case resolutionTextURL = "resolution_text_url"
        case dueDate = "due_date"
        case createdAt = "created_at"
        case createdBy = "created_by"
        case createdByUsername = "created_by_username"
        case mapID = "map_id"
        case assignedTo = "assigned_to"
        case assignedToUsername = "assigned_to_username"
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(Int.self, forKey: .id)
        title = try c.decode(String.self, forKey: .title)
        category = try c.decode(String.self, forKey: .category)
        description = try c.decodeIfPresent(String.self, forKey: .description) ?? ""
        lat = try c.decodeIfPresent(Double.self, forKey: .lat)
        lng = try c.decodeIfPresent(Double.self, forKey: .lng)
        photoURL = try c.decodeIfPresent(String.self, forKey: .photoURL)
        thumbURL = try c.decodeIfPresent(String.self, forKey: .thumbURL)
        textURL = try c.decodeIfPresent(String.self, forKey: .textURL)
        resolutionPhotoURL = try c.decodeIfPresent(String.self, forKey: .resolutionPhotoURL)
        resolutionThumbURL = try c.decodeIfPresent(String.self, forKey: .resolutionThumbURL)
        resolutionTextURL = try c.decodeIfPresent(String.self, forKey: .resolutionTextURL)
        status = (try? c.decode(IssueStatus.self, forKey: .status)) ?? .open
        priority = (try? c.decode(Priority.self, forKey: .priority)) ?? .medium
        dueDate = try c.decodeIfPresent(String.self, forKey: .dueDate)
        createdAt = try c.decodeIfPresent(String.self, forKey: .createdAt) ?? ""
        createdBy = try c.decodeIfPresent(Int.self, forKey: .createdBy)
        createdByUsername = try c.decodeIfPresent(String.self, forKey: .createdByUsername)
        mapID = try c.decodeIfPresent(Int.self, forKey: .mapID)
        assignedTo = try c.decodeIfPresent(Int.self, forKey: .assignedTo)
        assignedToUsername = try c.decodeIfPresent(String.self, forKey: .assignedToUsername)
    }
}

// MARK: - Paginación

/// Envoltura de los listados paginados del backend: `{ items, page, pageSize, total }`.
struct Paginated<Element: Codable>: Codable {
    let items: [Element]
    let page: Int?
    let pageSize: Int?
    let total: Int?
}
