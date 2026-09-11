import Foundation

/// El email de recuperación (`src/services/mail.service.js::notifyPasswordReset`)
/// enlaza a `<PUBLIC_URL>/#reset-password?token=<hex>` — una URL pensada para la
/// SPA web, que esta app no intercepta (fuera de alcance, ver `docs/PLAN_APP_MACOS.md`
/// §Hito 3, "Universal Links"). En vez de eso, `ResetPasswordView` deja pegar el
/// enlace completo o solo el token; esto extrae el valor en cualquiera de los
/// dos casos. Función pura para poder testearla sin UI.
enum ResetTokenParsing {
    nonisolated static func token(from raw: String) -> String? {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }

        if let range = trimmed.range(of: "token=") {
            let after = trimmed[range.upperBound...]
            let value = after.prefix { !$0.isWhitespace && $0 != "&" && $0 != "#" }
            return value.isEmpty ? nil : String(value)
        }

        // Sin "token=" en el texto: se asume que ya es el token en bruto
        // (`crypto.randomBytes(32).toString("hex")` en el backend → 64 hex).
        return trimmed.allSatisfy(\.isHexDigit) ? trimmed : nil
    }
}
