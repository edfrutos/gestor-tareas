import Foundation
import Observation
import SwiftUI

/// Tema de la app — calcado del selector "Automático/Claro/Oscuro" de la web
/// (`initTheme()` en `src/public/ui/app.js`), independiente de si el sistema
/// está en claro u oscuro.
enum AppearanceMode: String, CaseIterable, Identifiable {
    case auto, light, dark

    var id: String { rawValue }

    var label: String {
        switch self {
        case .auto: return "Automático"
        case .light: return "Claro"
        case .dark: return "Oscuro"
        }
    }

    /// `nil` deja que SwiftUI siga el sistema (equivalente al modo "auto" web).
    var colorScheme: ColorScheme? {
        switch self {
        case .auto: return nil
        case .light: return .light
        case .dark: return .dark
        }
    }
}

/// Preferencias de la app persistidas en `UserDefaults`.
@MainActor
@Observable
final class AppSettings {

    static let defaultsKey = "server.baseURL"
    static let fallbackURLString = "https://localhost:8443"
    static let appearanceDefaultsKey = "app.appearanceMode"

    var serverURLString: String {
        didSet { UserDefaults.standard.set(serverURLString, forKey: Self.defaultsKey) }
    }

    var appearanceMode: AppearanceMode {
        didSet { UserDefaults.standard.set(appearanceMode.rawValue, forKey: Self.appearanceDefaultsKey) }
    }

    init() {
        serverURLString = UserDefaults.standard.string(forKey: Self.defaultsKey)
            ?? Self.fallbackURLString
        appearanceMode = UserDefaults.standard.string(forKey: Self.appearanceDefaultsKey)
            .flatMap(AppearanceMode.init(rawValue:)) ?? .auto
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
