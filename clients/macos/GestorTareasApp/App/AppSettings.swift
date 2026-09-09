import Foundation
import Observation

/// Preferencias de la app persistidas en `UserDefaults`. De momento solo la URL del servidor.
@MainActor
@Observable
final class AppSettings {

    static let defaultsKey = "server.baseURL"
    static let fallbackURLString = "https://localhost:8443"

    var serverURLString: String {
        didSet { UserDefaults.standard.set(serverURLString, forKey: Self.defaultsKey) }
    }

    init() {
        serverURLString = UserDefaults.standard.string(forKey: Self.defaultsKey)
            ?? Self.fallbackURLString
    }

    /// URL base validada, o `nil` si el texto no es una URL http(s) utilizable.
    var baseURL: URL? {
        let trimmed = serverURLString.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let url = URL(string: trimmed),
              let scheme = url.scheme?.lowercased(),
              scheme == "http" || scheme == "https",
              url.host != nil else {
            return nil
        }
        return url
    }

    /// Resuelve una ruta relativa del backend (`/uploads/x.jpg`) contra `baseURL`.
    func mediaURL(_ path: String?) -> URL? {
        guard let path, !path.isEmpty, let base = baseURL else { return nil }
        if let absolute = URL(string: path), absolute.scheme != nil { return absolute }
        return URL(string: path, relativeTo: base)?.absoluteURL
    }
}
