import SwiftUI

struct IssueListView: View {
    @Environment(SessionStore.self) private var session
    @Environment(AppSettings.self) private var settings
    @State private var model = IssueListViewModel()

    var body: some View {
        content
            .navigationTitle("Tareas")
            .toolbar {
                ToolbarItem {
                    Button {
                        load()
                    } label: {
                        Label("Recargar", systemImage: "arrow.clockwise")
                    }
                    .disabled(model.isLoading)
                }
            }
            .task { load() }
    }

    @ViewBuilder
    private var content: some View {
        if model.isLoading && model.issues.isEmpty {
            ProgressView().controlSize(.large)
        } else if let error = model.errorMessage, model.issues.isEmpty {
            ContentUnavailableView {
                Label("No se pudieron cargar las tareas", systemImage: "exclamationmark.triangle")
            } description: {
                Text(error)
            } actions: {
                Button("Reintentar") { load() }
            }
        } else if model.issues.isEmpty {
            ContentUnavailableView("Sin tareas", systemImage: "tray",
                                   description: Text("No hay tareas visibles para tu cuenta."))
        } else {
            Table(model.issues) {
                TableColumn("Título", value: \.title)
                TableColumn("Categoría", value: \.category)
                TableColumn("Estado") { Text($0.status.label) }
                TableColumn("Prioridad") { Text($0.priority.label) }
                TableColumn("Vence") { Text($0.dueDate ?? "—") }
                TableColumn("Asignada a") { Text($0.assignedToUsername ?? "—") }
            }
        }
    }

    private func load() {
        Task { await model.load(settings: settings, session: session) }
    }
}
