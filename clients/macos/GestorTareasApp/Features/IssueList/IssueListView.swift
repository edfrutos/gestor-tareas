import SwiftUI

struct IssueListView: View {
    @Environment(SessionStore.self) private var session
    @Environment(AppSettings.self) private var settings
    @State private var model = IssueListViewModel()

    var body: some View {
        @Bindable var model = model

        return VStack(spacing: 0) {
            IssueFilterBar(filter: $model.filter,
                           categories: model.categories,
                           onCommit: reload)
            Divider()
            listBody
        }
        .navigationTitle("Tareas")
        .toolbar {
            ToolbarItem {
                Button(action: reload) {
                    Label("Recargar", systemImage: "arrow.clockwise")
                }
                .disabled(model.isLoading)
            }
        }
        .task { await model.firstLoad(settings: settings, session: session) }
    }

    @ViewBuilder
    private var listBody: some View {
        if model.isLoading && model.issues.isEmpty {
            VStack { Spacer(); ProgressView().controlSize(.large); Spacer() }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if let error = model.errorMessage, model.issues.isEmpty {
            ContentUnavailableView {
                Label("No se pudieron cargar las tareas", systemImage: "exclamationmark.triangle")
            } description: {
                Text(error)
            } actions: {
                Button("Reintentar", action: reload)
            }
        } else if model.issues.isEmpty {
            ContentUnavailableView("Sin resultados",
                                   systemImage: "tray",
                                   description: Text("Ninguna tarea coincide con los filtros."))
        } else {
            List {
                ForEach(model.issues) { issue in
                    NavigationLink(value: issue.id) {
                        IssueRowView(issue: issue)
                    }
                    .task {
                        await model.loadMoreIfNeeded(current: issue,
                                                     settings: settings,
                                                     session: session)
                    }
                }

                if model.isLoadingMore {
                    HStack { Spacer(); ProgressView(); Spacer() }
                }
            }
            .overlay(alignment: .bottom) { footer }
        }
    }

    @ViewBuilder
    private var footer: some View {
        if model.total > 0 {
            Text("\(model.issues.count) de \(model.total)")
                .font(.caption)
                .foregroundStyle(.secondary)
                .padding(6)
                .background(.thinMaterial, in: Capsule())
                .padding(6)
        }
    }

    private func reload() {
        Task { await model.reload(settings: settings, session: session) }
    }
}
