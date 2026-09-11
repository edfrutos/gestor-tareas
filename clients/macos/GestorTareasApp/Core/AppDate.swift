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

    /// Formateador de fechas `YYYY-MM-DD` (calendario, sin hora) que espera el
    /// backend en `due_date`, `from` y `to`. Zona UTC y locale POSIX para que el
    /// día no se desplace por la configuración regional.
    private static let dayFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(identifier: "UTC")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }()

    /// `Date` → `"YYYY-MM-DD"`.
    static func iso8601Day(_ date: Date) -> String {
        dayFormatter.string(from: date)
    }

    /// `"YYYY-MM-DD"` → `Date` (medianoche UTC), o `nil` si no encaja.
    static func parseDay(_ string: String?) -> Date? {
        guard let string, !string.isEmpty else { return nil }
        return dayFormatter.date(from: string)
    }
}
