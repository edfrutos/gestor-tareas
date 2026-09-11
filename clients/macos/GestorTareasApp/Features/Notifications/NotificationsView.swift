import SwiftUI

/// Centro de notificaciones: actividad (comentarios, respuestas, cambios) en
/// tareas creadas o asignadas al usuario. Sondeo cada 30 s
/// (`NotificationsViewModel.startPolling`); tocar una entrada abre la tarea.
struct NotificationsView: View {
    @Environment(SessionStore.self) private var session
    @Environment(AppSettings.self) private var settings
    @State private var model = NotificationsViewModel()

    var body: some View {
        content
            .navigationTitle("Notificaciones")
            .toolbar {
                ToolbarItem {
                    Button(action: reload) {
                        Label("Recargar", systemImage: "arrow.clockwise")
                    }
                    .disabled(model.isLoading)
                }
            }
            .task { await model.startPolling(settings: settings, session: session) }
    }

    @ViewBuilder
    private var content: some View {
        if model.isLoading && model.items.isEmpty {
            VStack { Spacer(); ProgressView().controlSize(.large); Spacer() }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if let error = model.errorMessage, model.items.isEmpty {
            ContentUnavailableView {
                Label("No se pudieron cargar las notificaciones", systemImage: "bell.slash")
            } description: {
                Text(error)
            } actions: {
                Button("Reintentar", action: reload)
            }
        } else if model.items.isEmpty {
            ContentUnavailableView("Sin novedades", systemImage: "bell",
                                   description: Text("Aquí verás la actividad de tus tareas: comentarios, respuestas y cambios de estado."))
        } else {
            List(model.items) { item in
                NavigationLink(value: item.issueID) {
                    NotificationRow(item: item)
                }
            }
            .listStyle(.inset)
        }
    }

    private func reload() {
        Task { await model.load(settings: settings, session: session) }
    }
}

private struct NotificationRow: View {
    let item: AppNotification

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: symbol)
                .foregroundStyle(color)
                .frame(width: 20)

            VStack(alignment: .leading, spacing: 3) {
                Text(item.issueTitle).font(.callout.weight(.medium))
                Text(detail)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            }

            Spacer()

            Text(AppDate.mediumDateTime(item.createdAt))
                .font(.caption2)
                .foregroundStyle(.tertiary)
        }
        .padding(.vertical, 3)
    }

    private var symbol: String {
        switch item.type {
        case .comment: return "bubble.left"
        case .reply: return "arrowshape.turn.up.left"
        case .log: return "clock.arrow.circlepath"
        }
    }

    private var color: Color {
        switch item.type {
        case .comment, .reply: return .accentColor
        case .log: return .orange
        }
    }

    private var detail: String {
        switch item.type {
        case .comment:
            return "\(item.commenterUsername ?? "Alguien") comentó: \(item.textPreview ?? "")"
        case .reply:
            return "\(item.commenterUsername ?? "Alguien") respondió: \(item.textPreview ?? "")"
        case .log:
            let label = item.actionLabel ?? "Cambio"
            if let old = item.oldValue, let new = item.newValue {
                return "\(label): \(old) → \(new)"
            }
            if let new = item.newValue {
                return "\(label): \(new)"
            }
            return label
        }
    }
}
