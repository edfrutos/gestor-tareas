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
