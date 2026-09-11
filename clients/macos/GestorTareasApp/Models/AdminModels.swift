import Foundation

// MARK: - Usuarios  (GET/POST/PATCH/DELETE /v1/users, Hito 4, solo admin)

struct AdminUser: Codable, Identifiable, Equatable {
    let id: Int
    var username: String
    var email: String?
    var role: String
    var createdAt: String?

    enum CodingKeys: String, CodingKey {
        case id, username, email, role
        case createdAt = "created_at"
    }

    var isAdmin: Bool { role == "admin" }
}

// MARK: - Settings en caliente  (GET/PATCH /v1/settings, Hito 4, solo admin)

/// Claves fijas que expone `src/services/config.service.js::getAllSettings`.
/// Cada valor puede llegar como `null` (sin valor en DB ni variable de
/// entorno), y los tipos ya vienen convertidos por el backend
/// (`parseValue`): booleano, número o cadena.
struct AppRuntimeSettings: Codable, Equatable {
    var maxUploadBytes: Int?
    var rateLimitEnabled: Bool?
    var rateLimitWindowMs: Int?
    var rateLimitMax: Int?
    var adminEmail: String?
    var publicURL: String?
    var mailpitURL: String?

    enum CodingKeys: String, CodingKey {
        case maxUploadBytes = "MAX_UPLOAD_BYTES"
        case rateLimitEnabled = "RATE_LIMIT_ENABLED"
        case rateLimitWindowMs = "RATE_LIMIT_WINDOW_MS"
        case rateLimitMax = "RATE_LIMIT_MAX"
        case adminEmail = "ADMIN_EMAIL"
        case publicURL = "PUBLIC_URL"
        case mailpitURL = "MAILPIT_URL"
    }

    init() {}

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        maxUploadBytes = try c.decodeIfPresent(Int.self, forKey: .maxUploadBytes)
        rateLimitEnabled = try c.decodeIfPresent(Bool.self, forKey: .rateLimitEnabled)
        rateLimitWindowMs = try c.decodeIfPresent(Int.self, forKey: .rateLimitWindowMs)
        rateLimitMax = try c.decodeIfPresent(Int.self, forKey: .rateLimitMax)
        adminEmail = try c.decodeIfPresent(String.self, forKey: .adminEmail)
        publicURL = try c.decodeIfPresent(String.self, forKey: .publicURL)
        mailpitURL = try c.decodeIfPresent(String.self, forKey: .mailpitURL)
    }
}

/// Solo las claves que han cambiado respecto al `AppRuntimeSettings` original
/// (ver `AdminSettingsViewModel.diff`). `PATCH /v1/settings` actualiza de
/// forma atómica y solo las claves presentes en el cuerpo.
struct SettingsPatch: Encodable {
    var maxUploadBytes: Int?
    var rateLimitEnabled: Bool?
    var rateLimitWindowMs: Int?
    var rateLimitMax: Int?
    var adminEmail: String?
    var publicURL: String?
    var mailpitURL: String?

    var isEmpty: Bool {
        maxUploadBytes == nil && rateLimitEnabled == nil && rateLimitWindowMs == nil
            && rateLimitMax == nil && adminEmail == nil && publicURL == nil && mailpitURL == nil
    }

    enum CodingKeys: String, CodingKey {
        case maxUploadBytes = "MAX_UPLOAD_BYTES"
        case rateLimitEnabled = "RATE_LIMIT_ENABLED"
        case rateLimitWindowMs = "RATE_LIMIT_WINDOW_MS"
        case rateLimitMax = "RATE_LIMIT_MAX"
        case adminEmail = "ADMIN_EMAIL"
        case publicURL = "PUBLIC_URL"
        case mailpitURL = "MAILPIT_URL"
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encodeIfPresent(maxUploadBytes, forKey: .maxUploadBytes)
        try c.encodeIfPresent(rateLimitEnabled, forKey: .rateLimitEnabled)
        try c.encodeIfPresent(rateLimitWindowMs, forKey: .rateLimitWindowMs)
        try c.encodeIfPresent(rateLimitMax, forKey: .rateLimitMax)
        try c.encodeIfPresent(adminEmail, forKey: .adminEmail)
        try c.encodeIfPresent(publicURL, forKey: .publicURL)
        try c.encodeIfPresent(mailpitURL, forKey: .mailpitURL)
    }
}
