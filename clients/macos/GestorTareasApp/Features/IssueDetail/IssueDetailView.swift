import QuickLook
import SwiftUI

struct IssueDetailView: View {
    let issueID: Int

    @Environment(SessionStore.self) private var session
    @Environment(AppSettings.self) private var settings
    @Environment(SocketClient.self) private var socket
    @State private var model = IssueDetailViewModel()
    @State private var showEditor = false
    @State private var showPlan = false
    @State private var replyingTo: Int?
    @State private var previewURL: URL?
    @State private var downloadingPreviewURL: URL?
    @State private var previewLoadError: String?

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
            } else {
                // Estado transitorio antes de que `.task(id:)` arranque (o si se
                // cancela sin llegar a fijar isLoading/errorMessage): sin este
                // reintento la vista se queda en blanco de forma indefinida.
                ProgressView().controlSize(.large)
                    .onAppear { load() }
            }
        }
        .navigationTitle(model.issue?.title ?? "Tarea \(issueID)")
        .toolbar {
            ToolbarItemGroup {
                if model.issue != nil {
                    Button { showEditor = true } label: {
                        Label("Editar", systemImage: "square.and.pencil")
                    }
                }
                Button(action: load) {
                    Label("Recargar", systemImage: "arrow.clockwise")
                }
                .disabled(model.isLoading)
            }
        }
        .sheet(isPresented: $showEditor) {
            if let issue = model.issue {
                IssueEditorView(mode: .edit(issue)) { updated in
                    Task { await model.apply(updated: updated, settings: settings, session: session) }
                }
                .environment(session)
                .environment(settings)
            }
        }
        .sheet(isPresented: $showPlan) {
            if let issue = model.issue {
                NavigationStack {
                    PlanView(initialMapID: issue.mapID, highlightIssueID: issue.id)
                        .navigationDestination(for: Int.self) { id in
                            IssueDetailView(issueID: id)
                        }
                        .toolbar {
                            ToolbarItem(placement: .cancellationAction) {
                                Button("Cerrar") { showPlan = false }
                            }
                        }
                }
                .environment(session)
                .environment(settings)
                .environment(socket)
                .frame(minWidth: 720, minHeight: 560)
            }
        }
        .task(id: issueID) {
            await model.load(id: issueID, settings: settings, session: session)
        }
        .task(id: socket.lastEvent?.id) {
            if let event = socket.lastEvent?.payload {
                await model.applyRealtime(event, settings: settings, session: session)
            }
        }
        .quickLookPreview($previewURL)
        .alert("No se pudo abrir el archivo", isPresented: Binding(
            get: { previewLoadError != nil },
            set: { if !$0 { previewLoadError = nil } }
        )) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(previewLoadError ?? "")
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
        .cardStyle()
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
            .cardStyle()
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
                if issue.mapID != nil {
                    Button("Ver en el plano") { showPlan = true }
                        .buttonStyle(.link)
                }
            }
            .cardStyle()
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
        .cardStyle()
    }

    @ViewBuilder
    private var commentsSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            sectionTitle("Comentarios")
            if model.comments.isEmpty {
                Text("Sin comentarios. Sé el primero en comentar.")
                    .font(.callout)
                    .foregroundStyle(.secondary)
            } else {
                CommentTree(comments: model.comments,
                            replyingTo: replyingTo,
                            isPosting: model.isPostingComment,
                            onStartReply: { replyingTo = $0.id },
                            onCancelReply: { replyingTo = nil },
                            onSubmitReply: { parentID, text in
                                submitComment(text: text, parentID: parentID)
                            })
            }

            if let commentError = model.commentError {
                Label(commentError, systemImage: "exclamationmark.triangle")
                    .font(.caption)
                    .foregroundStyle(.red)
            }

            CommentComposer(placeholder: "Escribe un comentario…",
                            submitLabel: "Comentar",
                            isBusy: model.isPostingComment && replyingTo == nil) { text in
                submitComment(text: text, parentID: nil)
            }
            .padding(.top, 4)
        }
        .cardStyle()
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
        /// URL de baja resolución para la miniatura en la fila (thumb si existe).
        let displayURL: URL
        /// URL a descargar y previsualizar con Quick Look (el original a ser posible).
        let previewURL: URL
        let isDocument: Bool
    }

    private func mediaItems(photo: String?, thumb: String?, doc: String?) -> [MediaItem] {
        var items: [MediaItem] = []
        if let displayURL = settings.mediaURL(thumb ?? photo),
           let previewURL = settings.mediaURL(photo ?? thumb) {
            items.append(MediaItem(displayURL: displayURL, previewURL: previewURL, isDocument: false))
        }
        if let url = settings.mediaURL(doc) {
            items.append(MediaItem(displayURL: url, previewURL: url, isDocument: true))
        }
        return items
    }

    private func mediaRow(_ items: [MediaItem]) -> some View {
        HStack(spacing: 12) {
            ForEach(items) { item in
                Button {
                    Task { await openPreview(item.previewURL) }
                } label: {
                    if item.isDocument {
                        if isLoadingPreview(item.previewURL) {
                            ProgressView().controlSize(.small)
                        } else {
                            Label("Ver documento", systemImage: "doc.text")
                        }
                    } else {
                        AsyncImage(url: item.displayURL) { phase in
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
                        .overlay {
                            if isLoadingPreview(item.previewURL) {
                                ZStack {
                                    Color.black.opacity(0.35)
                                    ProgressView().controlSize(.small).tint(.white)
                                }
                                .clipShape(RoundedRectangle(cornerRadius: 8))
                            }
                        }
                    }
                }
                .buttonStyle(.plain)
                .disabled(isLoadingPreview(item.previewURL))
            }
        }
    }

    private func isLoadingPreview(_ url: URL) -> Bool {
        downloadingPreviewURL == url
    }

    /// Descarga el archivo remoto a un temporal y lo abre con Quick Look
    /// nativo, en vez de delegar a Safari/Chrome como hacía `Link`.
    @MainActor
    private func openPreview(_ url: URL) async {
        downloadingPreviewURL = url
        defer { downloadingPreviewURL = nil }
        do {
            let (data, response) = try await URLSession.shared.data(from: url)
            if let http = response as? HTTPURLResponse, !(200...299).contains(http.statusCode) {
                previewLoadError = "No se pudo descargar el archivo (código \(http.statusCode))."
                return
            }
            let ext = url.pathExtension.isEmpty ? "bin" : url.pathExtension
            let tempURL = FileManager.default.temporaryDirectory
                .appendingPathComponent(UUID().uuidString)
                .appendingPathExtension(ext)
            try data.write(to: tempURL, options: .atomic)
            previewURL = tempURL
        } catch {
            previewLoadError = error.localizedDescription
        }
    }

    private func load() {
        Task { await model.load(id: issueID, settings: settings, session: session) }
    }

    private func submitComment(text: String, parentID: Int?) {
        Task {
            let ok = await model.postComment(text: text,
                                             parentID: parentID,
                                             settings: settings,
                                             session: session)
            if ok { replyingTo = nil }
        }
    }
}
