import Foundation

/// Parseo y formateo de las fechas ISO 8601 que devuelve el backend
/// (p. ej. `2026-09-08T10:00:00.000Z`, a veces sin fracción de segundo).
enum AppDate {

    private static let withFraction: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    private static let plain: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter
    }()

    static func parse(_ string: String) -> Date? {
        withFraction.date(from: string) ?? plain.date(from: string)
    }

    /// Fecha + hora abreviadas en la configuración regional del sistema.
    static func mediumDateTime(_ string: String) -> String {
        guard let date = parse(string) else { return string }
        return date.formatted(date: .abbreviated, time: .shortened)
    }

    /// Solo fecha (para `due_date`, que llega como `YYYY-MM-DD`).
    static func day(_ string: String?) -> String {
        guard let string, !string.isEmpty else { return "—" }
        return string
    }
}
