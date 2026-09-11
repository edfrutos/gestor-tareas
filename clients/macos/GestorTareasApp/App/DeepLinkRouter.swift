import Foundation
import Observation

/// Resuelve los deep-links de la app y guarda el destino pendiente hasta que
/// `MainView` lo consume (puede llegar antes de iniciar sesión).
///
/// Formas admitidas:
/// - `gestortareas://issue/<id>` — esquema propio de la app.
/// - `gestortareas://open?issue=<id>` — mismo parámetro `?issue=` que usa el QR
///   de la SPA web (`src/public/ui/modules/qr.js`), para que un enlace copiado
///   de ahí funcione igual si se abre con este esquema.
@MainActor
@Observable
final class DeepLinkRouter {
    var pendingIssueID: Int?

    func handle(_ url: URL) {
        guard let id = Self.issueID(from: url) else { return }
        pendingIssueID = id
    }

    nonisolated static func issueID(from url: URL) -> Int? {
        guard url.scheme?.lowercased() == "gestortareas" else { return nil }

        if url.host?.lowercased() == "issue" {
            let segment = url.pathComponents.last { $0 != "/" }
            if let segment, let id = Int(segment) { return id }
        }

        if let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
           let value = components.queryItems?.first(where: { $0.name == "issue" })?.value,
           let id = Int(value) {
            return id
        }

        return nil
    }
}
