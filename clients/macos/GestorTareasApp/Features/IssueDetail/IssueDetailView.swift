import SwiftUI

struct IssueDetailView: View {
    let issueID: Int

    @Environment(SessionStore.self) private var session
    @Environment(AppSettings.self) private var settings
    @State private var model = IssueDetailViewModel()

    var body: some View {
        Group {
            if model.isLoading && model.issue == nil {
                ProgressView().controlSize(.large)
            } else if let error = model.errorMessage, model.issue == nil {
                ContentUnavailableView {
                    Label("No se pudo abrir la tarea", systemImage: "exclamationmark.triangle")
                } description: {
                    Text(error)
                } actions: {
                    Button("Reintentar") { load() }
                }
            } else if let issue = model.issue {
                content(for: issue)
            }
        }
        .navigationTitle(model.issue?.title ?? "Tarea \(issueID)")
        .toolbar {
            ToolbarItem {
                Button(action: load) {
                    Label("Recargar", systemImage: "arrow.clockwise")
                }
                .disabled(model.isLoading)
            }
        }
        .task(id: issueID) {
            await model.load(id: issueID, settings: settings, session: session)
        }
    }

    private func content(for issue: Issue) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                header(issue)
                metadata(issue)
                evidence(issue)
                location(issue)
                history
                commentsSection
            }
            .padding(24)
            .frame(maxWidth: 760, alignment: .leading)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    // MARK: Secciones

    private func header(_ issue: Issue) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(issue.title).font(.title2.bold())
            HStack(spacing: 8) {
                TagPill(text: issue.status.label, color: issue.status.color)
                TagPill(text: "Prioridad: \(issue.priority.label)", color: issue.priority.color)
            }
            Text(issue.description)
                .textSelection(.enabled)
                .foregroundStyle(.secondary)
        }
    }

    private func metadata(_ issue: Issue) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionTitle("Detalles")
            Grid(alignment: .leadingFirstTextBaseline, horizontalSpacing: 16, verticalSpacing: 6) {
                row("Categoría", issue.category)
                row("Autor", issue.createdByUsername ?? "—")
                row("Asignada a", issue.assignedToUsername ?? "Sin asignar")
                row("Creada", AppDate.mediumDateTime(issue.createdAt))
                row("Fecha límite", AppDate.day(issue.dueDate))
                row("Plano", issue.mapID.map { "#\($0)" } ?? "—")
            }
        }
    }

    @ViewBuilder
    private func evidence(_ issue: Issue) -> some View {
        let originals = mediaItems(photo: issue.photoURL, thumb: issue.thumbURL, doc: issue.textURL)
        let resolution = mediaItems(photo: issue.resolutionPhotoURL,
                                    thumb: issue.resolutionThumbURL,
                                    doc: issue.resolutionTextURL)
        if !originals.isEmpty || !resolution.isEmpty {
            VStack(alignment: .leading, spacing: 12) {
                sectionTitle("Evidencia")
                if !originals.isEmpty {
                    Text("Original").font(.subheadline.weight(.semibold))
                    mediaRow(originals)
                }
                if !resolution.isEmpty {
                    Text("Resolución").font(.subheadline.weight(.semibold))
                    mediaRow(resolution)
                }
            }
        }
    }

    @ViewBuilder
    private func location(_ issue: Issue) -> some View {
        if let lat = issue.lat, let lng = issue.lng {
            VStack(alignment: .leading, spacing: 6) {
                sectionTitle("Ubicación en el plano")
                Text(String(format: "x: %.1f · y: %.1f", lat, lng))
                    .font(.callout.monospacedDigit())
                    .foregroundStyle(.secondary)
                Text("El visor del plano llega en el Hito 3.")
                    .font(.caption)
                    .foregroundStyle(.tertiary)
            }
        }
    }

    @ViewBuilder
    private var history: some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionTitle("Historial")
            if model.logs.isEmpty {
                Text("Sin cambios registrados.").font(.callout).foregroundStyle(.secondary)
            } else {
                ForEach(model.logs) { log in
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        Text(AppDate.mediumDateTime(log.createdAt))
                            .font(.caption.monospacedDigit())
                            .foregroundStyle(.secondary)
                            .frame(width: 130, alignment: .leading)
                        Text(log.actionLabel).font(.callout.weight(.medium))
                        if let old = log.oldValue, let new = log.newValue {
                            Text("\(old) → \(new)").font(.callout).foregroundStyle(.secondary)
                        } else if let new = log.newValue {
                            Text(new).font(.callout).foregroundStyle(.secondary)
                        }
                        Spacer()
                    }
                }
            }
        }
    }

    @ViewBuilder
    private var commentsSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            sectionTitle("Comentarios")
            if model.comments.isEmpty {
                Text("Sin comentarios.").font(.callout).foregroundStyle(.secondary)
            } else {
                CommentTree(comments: model.comments)
            }
            Text("Responder y comentar llega en el Hito 2.")
                .font(.caption)
                .foregroundStyle(.tertiary)
        }
    }

    // MARK: Utilidades de vista

    private func sectionTitle(_ text: String) -> some View {
        Text(text)
            .font(.title3.weight(.semibold))
    }

    private func row(_ label: String, _ value: String) -> some View {
        GridRow {
            Text(label).foregroundStyle(.secondary)
            Text(value).textSelection(.enabled)
        }
        .font(.callout)
    }

    private struct MediaItem: Identifiable {
        let id = UUID()
        let url: URL
        let isDocument: Bool
    }

    private func mediaItems(photo: String?, thumb: String?, doc: String?) -> [MediaItem] {
        var items: [MediaItem] = []
        if let url = settings.mediaURL(thumb ?? photo) {
            items.append(MediaItem(url: url, isDocument: false))
        }
        if let url = settings.mediaURL(doc) {
            items.append(MediaItem(url: url, isDocument: true))
        }
        return items
    }

    private func mediaRow(_ items: [MediaItem]) -> some View {
        HStack(spacing: 12) {
            ForEach(items) { item in
                if item.isDocument {
                    Link(destination: item.url) {
                        Label("Ver documento", systemImage: "doc.text")
                    }
                } else {
                    Link(destination: item.url) {
                        AsyncImage(url: item.url) { phase in
                            switch phase {
                            case .success(let image):
                                image.resizable().scaledToFill()
                            case .failure:
                                Image(systemName: "photo").imageScale(.large).foregroundStyle(.secondary)
                            default:
                                ProgressView()
                            }
                        }
                        .frame(width: 120, height: 120)
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                        .overlay(RoundedRectangle(cornerRadius: 8).stroke(.quaternary))
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private func load() {
        Task { await model.load(id: issueID, settings: settings, session: session) }
    }
}
