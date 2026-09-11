import SwiftUI

/// Etiqueta compacta tipo "píldora" para estado / prioridad.
struct TagPill: View {
    let text: String
    let color: Color

    var body: some View {
        Text(text)
            .font(.caption2.weight(.semibold))
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(color.opacity(0.18), in: Capsule())
            .foregroundStyle(color)
    }
}

extension IssueStatus {
    var color: Color {
        switch self {
        case .open: return .blue
        case .inProgress: return .orange
        case .resolved: return .green
        }
    }
}

extension Priority {
    var color: Color {
        switch self {
        case .low: return .secondary
        case .medium: return .blue
        case .high: return .orange
        case .critical: return .red
        }
    }
}

extension Color {
    /// `"#RRGGBB"` (el formato que usa `map_zones.color`) → `Color`. Gris si no
    /// se puede interpretar.
    init(hex: String) {
        var s = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        if s.hasPrefix("#") { s.removeFirst() }
        guard s.count == 6, let value = UInt32(s, radix: 16) else {
            self = .gray
            return
        }
        let r = Double((value >> 16) & 0xFF) / 255
        let g = Double((value >> 8) & 0xFF) / 255
        let b = Double(value & 0xFF) / 255
        self = Color(red: r, green: g, blue: b)
    }
}

extension MapZone {
    /// `color` (`"#RRGGBB"`) traducido a `Color`.
    var displayColor: Color { Color(hex: color) }
}
