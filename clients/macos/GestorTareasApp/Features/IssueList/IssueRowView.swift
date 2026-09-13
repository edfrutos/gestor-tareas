import SwiftUI

/// Fila de la lista de tareas, estilo "tarjeta" — calca el aspecto de las
/// filas en `list.v2.js` (web): miniatura, título + descripción, línea de
/// metadatos (estado · prioridad con punto de color · fecha), chip de
/// categoría.
struct IssueRowView: View {
    let issue: Issue

    @Environment(AppSettings.self) private var settings

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            thumbnail

            VStack(alignment: .leading, spacing: 4) {
                Text(issue.title)
                    .font(.headline)
                    .lineLimit(1)

                if !issue.description.isEmpty {
                    Text(issue.description)
                        .font(.callout)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }

                metaLine
            }

            Spacer(minLength: 8)

            VStack(alignment: .trailing, spacing: 6) {
                Text(issue.category)
                    .font(.caption2.weight(.medium))
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(Theme.chip, in: Capsule())

                if issue.photoURL != nil || issue.textURL != nil {
                    HStack(spacing: 6) {
                        if issue.photoURL != nil { Image(systemName: "photo") }
                        if issue.textURL != nil { Image(systemName: "doc") }
                    }
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                }
            }
        }
        .padding(12)
        .background(Theme.panel, in: RoundedRectangle(cornerRadius: 12))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(Theme.cardBorder, lineWidth: 1))
    }

    private var metaLine: some View {
        HStack(spacing: 6) {
            Text(issue.status.label)
            dot
            HStack(spacing: 4) {
                Circle().fill(issue.priority.color).frame(width: 6, height: 6)
                Text(issue.priority.label)
            }
            if let due = issue.dueDate, !due.isEmpty {
                dot
                Label(due, systemImage: "calendar")
            }
            if let assignee = issue.assignedToUsername {
                dot
                Label(assignee, systemImage: "person")
            }
        }
        .font(.caption)
        .foregroundStyle(.secondary)
    }

    private var dot: some View {
        Text("·").foregroundStyle(.tertiary)
    }

    @ViewBuilder
    private var thumbnail: some View {
        if let url = settings.mediaURL(issue.thumbURL ?? issue.photoURL) {
            AsyncImage(url: url) { phase in
                switch phase {
                case .success(let image):
                    image.resizable().scaledToFill()
                default:
                    placeholderThumbnail
                }
            }
            .frame(width: 48, height: 48)
            .clipShape(RoundedRectangle(cornerRadius: 8))
        } else {
            placeholderThumbnail
        }
    }

    private var placeholderThumbnail: some View {
        RoundedRectangle(cornerRadius: 8)
            .fill(Theme.chip)
            .frame(width: 48, height: 48)
            .overlay {
                Image(systemName: "doc.text.image")
                    .foregroundStyle(.secondary)
            }
    }
}
