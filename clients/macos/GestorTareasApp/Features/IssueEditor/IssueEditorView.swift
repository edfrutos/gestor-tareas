import SwiftUI
import UniformTypeIdentifiers

/// Formulario de creación / edición de tarea. Se presenta como hoja (`.sheet`)
/// desde la lista (crear) y desde el detalle (editar).
struct IssueEditorView: View {
    let mode: IssueEditorMode
    /// Se llama con la tarea creada/actualizada antes de cerrar la hoja.
    var onSaved: (Issue) -> Void

    @Environment(\.dismiss) private var dismiss
    @Environment(SessionStore.self) private var session
    @Environment(AppSettings.self) private var settings
    @State private var model: IssueEditorViewModel
    @State private var isImportingMap = false
    @State private var pendingMapImage: Attachment?
    @State private var showMapNamePrompt = false
    @State private var mapNameInput = ""

    init(mode: IssueEditorMode, onSaved: @escaping (Issue) -> Void) {
        self.mode = mode
        self.onSaved = onSaved
        _model = State(wrappedValue: IssueEditorViewModel(mode: mode))
    }

    var body: some View {
        @Bindable var model = model

        VStack(spacing: 0) {
            header
            Divider()

            Form {
                dataSection(draft: $model.draft)
                classificationSection(draft: $model.draft)
                if !mode.isEditing {
                    locationSection(draft: $model.draft)
                }
                attachmentsSection(draft: $model.draft)
                if mode.isEditing {
                    resolutionSection(draft: $model.draft)
                }
            }
            .formStyle(.grouped)

            Divider()
            footer
        }
        .frame(width: 560, height: 640)
        .task { await model.loadReferenceData(settings: settings, session: session) }
        .fileImporter(isPresented: $isImportingMap,
                      allowedContentTypes: [.jpeg, .png, .webP],
                      allowsMultipleSelection: false) { result in
            handleMapPick(result)
        }
        .alert("Nombre del plano", isPresented: $showMapNamePrompt) {
            TextField("Nombre", text: $mapNameInput)
            Button("Cancelar", role: .cancel) { pendingMapImage = nil }
            Button("Subir") { confirmMapUpload() }
        } message: {
            Text("Se añadirá a la biblioteca de planos, disponible para cualquier tarea.")
        }
    }

    // MARK: Cabecera / pie

    private var header: some View {
        HStack {
            Text(model.navigationTitle).font(.headline)
            Spacer()
            if model.isLoadingReferenceData {
                ProgressView().controlSize(.small)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }

    private var footer: some View {
        VStack(alignment: .leading, spacing: 8) {
            ForEach(model.problems, id: \.self) { problem in
                Label(problem, systemImage: "exclamationmark.circle")
                    .font(.callout)
                    .foregroundStyle(.red)
            }
            if let error = model.errorMessage {
                Label(error, systemImage: "exclamationmark.triangle")
                    .font(.callout)
                    .foregroundStyle(.red)
            }

            HStack {
                Spacer()
                Button("Cancelar", role: .cancel) { dismiss() }
                    .keyboardShortcut(.cancelAction)
                Button(action: save) {
                    if model.isSubmitting {
                        ProgressView().controlSize(.small)
                    } else {
                        Text(model.submitLabel)
                    }
                }
                .keyboardShortcut(.defaultAction)
                .buttonStyle(.borderedProminent)
                .disabled(model.isSubmitting)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }

    // MARK: Secciones

    private func dataSection(draft: Binding<IssueDraft>) -> some View {
        Section("Datos") {
            TextField("Título", text: draft.title)
                .disabled(mode.isEditing)
            if mode.isEditing {
                Text("El título no puede cambiarse desde la API.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            HStack {
                TextField("Categoría", text: draft.category)
                if !model.categories.isEmpty {
                    Menu("Existentes") {
                        ForEach(model.categories, id: \.self) { category in
                            Button(category) { model.draft.category = category }
                        }
                    }
                    .fixedSize()
                }
            }

            VStack(alignment: .leading, spacing: 4) {
                Text("Descripción").font(.caption).foregroundStyle(.secondary)
                TextEditor(text: draft.details)
                    .frame(minHeight: 90)
                    .font(.body)
                    .overlay(RoundedRectangle(cornerRadius: 6).stroke(.quaternary))
            }
        }
    }

    private func classificationSection(draft: Binding<IssueDraft>) -> some View {
        Section("Clasificación") {
            if mode.isEditing {
                Picker("Estado", selection: draft.status) {
                    ForEach(IssueStatus.allCases) { status in
                        Text(status.label).tag(status)
                    }
                }
            }

            Picker("Prioridad", selection: draft.priority) {
                ForEach(Priority.allCases) { priority in
                    Text(priority.label).tag(priority)
                }
            }

            Toggle("Con fecha límite", isOn: draft.hasDueDate)
            if draft.wrappedValue.hasDueDate {
                DatePicker("Fecha límite",
                           selection: draft.dueDate,
                           displayedComponents: .date)
            }

            mapPicker(draft: draft)

            Picker("Asignar a", selection: draft.assignedTo) {
                Text("Sin asignar").tag(Int?.none)
                ForEach(model.assignees) { user in
                    Text(user.username).tag(Optional(user.id))
                }
            }
        }
    }

    @ViewBuilder
    private func mapPicker(draft: Binding<IssueDraft>) -> some View {
        if model.maps.isEmpty {
            Stepper("Plano #\(draft.wrappedValue.mapID)",
                    value: draft.mapID, in: 1...9_999)
        } else {
            Picker("Plano", selection: draft.mapID) {
                if !model.maps.contains(where: { $0.id == draft.wrappedValue.mapID }) {
                    Text("Plano #\(draft.wrappedValue.mapID)").tag(draft.wrappedValue.mapID)
                }
                ForEach(model.maps) { map in
                    Text(map.name).tag(map.id)
                }
            }
        }
        HStack {
            Button("Subir plano nuevo…") { isImportingMap = true }
                .disabled(model.isUploadingMap)
            if model.isUploadingMap {
                ProgressView().controlSize(.small)
            }
        }
        if let mapUploadError = model.mapUploadError {
            Text(mapUploadError).font(.caption).foregroundStyle(.red)
        }
    }

    private func locationSection(draft: Binding<IssueDraft>) -> some View {
        Section("Ubicación en el plano") {
            MapCoordinatePicker(mapID: draft.wrappedValue.mapID, x: draft.x, y: draft.y)
            HStack {
                TextField("X", text: draft.x, prompt: Text("Toca el plano…"))
                TextField("Y", text: draft.y, prompt: Text("Toca el plano…"))
            }
            Text("Toca sobre el plano para fijar la ubicación, o escribe las coordenadas a mano. "
                 + "Obligatorio: sin una posición real, la tarea no se puede crear.")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }

    private func attachmentsSection(draft: Binding<IssueDraft>) -> some View {
        Section("Adjuntos") {
            AttachmentField(label: "Foto",
                            systemImage: "photo",
                            kind: .image,
                            attachment: draft.photo,
                            existingHint: mode.editingIssue?.photoURL != nil
                                ? "Ya hay una imagen; subir otra la reemplaza." : nil)
            AttachmentField(label: "Documento",
                            systemImage: "doc",
                            kind: .document,
                            attachment: draft.document,
                            existingHint: mode.editingIssue?.textURL != nil
                                ? "Ya hay un documento; subir otro lo reemplaza." : nil)
        }
    }

    private func resolutionSection(draft: Binding<IssueDraft>) -> some View {
        Section("Prueba de resolución") {
            AttachmentField(label: "Foto de resolución",
                            systemImage: "checkmark.seal",
                            kind: .image,
                            attachment: draft.resolutionPhoto,
                            existingHint: mode.editingIssue?.resolutionPhotoURL != nil
                                ? "Ya hay una imagen de resolución; subir otra la reemplaza." : nil)
            AttachmentField(label: "Documento de resolución",
                            systemImage: "checkmark.seal",
                            kind: .document,
                            attachment: draft.resolutionDocument,
                            existingHint: mode.editingIssue?.resolutionTextURL != nil
                                ? "Ya hay un documento de resolución; subir otro lo reemplaza." : nil)
        }
    }

    // MARK: Acciones

    private func save() {
        Task {
            if let issue = await model.submit(settings: settings, session: session) {
                onSaved(issue)
                dismiss()
            }
        }
    }

    private func handleMapPick(_ result: Result<[URL], Error>) {
        guard case let .success(urls) = result, let url = urls.first else { return }
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        do {
            let data = try Data(contentsOf: url)
            pendingMapImage = Attachment(filename: url.lastPathComponent, data: data)
            mapNameInput = url.deletingPathExtension().lastPathComponent
            showMapNamePrompt = true
        } catch {
            model.mapUploadError = "No se pudo leer el archivo: \(error.localizedDescription)"
        }
    }

    private func confirmMapUpload() {
        guard let image = pendingMapImage else { return }
        let name = mapNameInput.trimmingCharacters(in: .whitespacesAndNewlines)
        Task {
            await model.uploadMap(name: name.isEmpty ? "Nuevo plano" : name,
                                  image: image,
                                  settings: settings,
                                  session: session)
            pendingMapImage = nil
        }
    }
}

// MARK: - Campo de adjunto con selector de fichero (sandbox)

private struct AttachmentField: View {
    enum Kind {
        case image, document

        var contentTypes: [UTType] {
            switch self {
            case .image:
                return [.jpeg, .png, .gif, .webP]
            case .document:
                return [.pdf, .plainText]
                    + ["md", "markdown"].compactMap { UTType(filenameExtension: $0) }
            }
        }
    }

    let label: String
    let systemImage: String
    let kind: Kind
    @Binding var attachment: Attachment?
    var existingHint: String?

    @State private var isImporting = false
    @State private var readError: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Label(label, systemImage: systemImage)
                Spacer()
                if attachment != nil {
                    Button("Quitar", role: .destructive) { attachment = nil }
                        .buttonStyle(.borderless)
                }
                Button(attachment == nil ? "Elegir…" : "Cambiar…") { isImporting = true }
            }

            if let attachment {
                Text("\(attachment.filename) · \(byteSize(attachment.byteCount))")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            } else if let existingHint {
                Text(existingHint)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            if let readError {
                Text(readError)
                    .font(.caption)
                    .foregroundStyle(.red)
            }
        }
        .fileImporter(isPresented: $isImporting,
                      allowedContentTypes: kind.contentTypes,
                      allowsMultipleSelection: false) { result in
            handle(result)
        }
    }

    private func handle(_ result: Result<[URL], Error>) {
        readError = nil
        switch result {
        case let .success(urls):
            guard let url = urls.first else { return }
            let scoped = url.startAccessingSecurityScopedResource()
            defer { if scoped { url.stopAccessingSecurityScopedResource() } }
            do {
                let data = try Data(contentsOf: url)
                attachment = Attachment(filename: url.lastPathComponent, data: data)
            } catch {
                readError = "No se pudo leer el archivo: \(error.localizedDescription)"
            }
        case let .failure(error):
            readError = error.localizedDescription
        }
    }

    private func byteSize(_ bytes: Int) -> String {
        ByteCountFormatter.string(fromByteCount: Int64(bytes), countStyle: .file)
    }
}
