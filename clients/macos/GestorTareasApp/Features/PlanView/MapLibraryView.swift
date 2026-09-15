import SwiftUI
import UniformTypeIdentifiers

/// Biblioteca de planos: ver todos los planos (con sus capas anidadas),
/// subir uno nuevo, archivar/restaurar y borrar — calca `maps.js` (web) tal
/// como se presenta en el modal "Planos". Se abre como hoja desde `PlanView`.
struct MapLibraryView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(SessionStore.self) private var session
    @Environment(AppSettings.self) private var settings
    @State private var model = MapLibraryViewModel()

    @State private var isImporting = false
    @State private var pendingImage: Attachment?
    @State private var showNamePrompt = false
    @State private var nameInput = ""
    @State private var pendingDelete: LibraryMap?

    var body: some View {
        @Bindable var model = model

        VStack(spacing: 0) {
            header
            Divider()
            Toggle("Ver planos archivados", isOn: $model.includeArchived)
                .toggleStyle(.checkbox)
                .padding(.horizontal, 16)
                .padding(.top, 10)
                .onChange(of: model.includeArchived) {
                    Task { await model.load(settings: settings, session: session) }
                }
            content
        }
        .frame(width: 520, height: 520)
        .task { await model.load(settings: settings, session: session) }
        .fileImporter(isPresented: $isImporting,
                      allowedContentTypes: [.jpeg, .png, .webP],
                      allowsMultipleSelection: false) { result in
            handlePick(result)
        }
        .alert("Nombre del plano", isPresented: $showNamePrompt) {
            TextField("Nombre", text: $nameInput)
            Button("Cancelar", role: .cancel) { pendingImage = nil }
            Button("Subir") { confirmUpload() }
        }
        .alert("No se pudo completar la operación", isPresented: Binding(
            get: { model.errorMessage != nil || model.uploadError != nil },
            set: { if !$0 { model.errorMessage = nil; model.uploadError = nil } }
        )) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(model.errorMessage ?? model.uploadError ?? "")
        }
        .confirmationDialog("¿Borrar este plano?",
                            isPresented: Binding(get: { pendingDelete != nil }, set: { if !$0 { pendingDelete = nil } }),
                            presenting: pendingDelete) { map in
            Button("Borrar \"\(map.name)\"", role: .destructive) {
                Task { await model.delete(map, settings: settings, session: session) }
            }
            Button("Cancelar", role: .cancel) {}
        } message: { _ in
            Text("Las tareas que lo usaban perderán la referencia al plano. Esta acción no se puede deshacer.")
        }
    }

    private var header: some View {
        HStack {
            Text("Biblioteca de planos").font(.headline)
            Spacer()
            if model.isLoading || model.isUploading {
                ProgressView().controlSize(.small)
            }
            Button("Subir plano nuevo…") { isImporting = true }
            Button("Cerrar") { dismiss() }
                .keyboardShortcut(.cancelAction)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }

    @ViewBuilder
    private var content: some View {
        if model.isLoading && model.items.isEmpty {
            VStack { Spacer(); ProgressView().controlSize(.large); Spacer() }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if model.groupedRows.isEmpty {
            ContentUnavailableView("Sin planos",
                                   systemImage: "map",
                                   description: Text("Todavía no hay ningún plano disponible."))
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else {
            ScrollView {
                VStack(spacing: 8) {
                    ForEach(model.groupedRows) { row in
                        MapLibraryRow(row: row,
                                      isBusy: model.busyMapID == row.map.id,
                                      onArchive: {
                                          Task { await model.toggleArchived(row.map, settings: settings, session: session) }
                                      },
                                      onDelete: { pendingDelete = row.map })
                    }
                }
                .padding(16)
            }
        }
    }

    // MARK: Subida

    private func handlePick(_ result: Result<[URL], Error>) {
        guard case let .success(urls) = result, let url = urls.first else { return }
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        do {
            let data = try Data(contentsOf: url)
            pendingImage = Attachment(filename: url.lastPathComponent, data: data)
            nameInput = url.deletingPathExtension().lastPathComponent
            showNamePrompt = true
        } catch {
            model.uploadError = "No se pudo leer el archivo: \(error.localizedDescription)"
        }
    }

    private func confirmUpload() {
        guard let image = pendingImage else { return }
        let name = nameInput.trimmingCharacters(in: .whitespacesAndNewlines)
        Task {
            await model.upload(name: name.isEmpty ? "Nuevo plano" : name,
                               image: image,
                               settings: settings,
                               session: session)
            pendingImage = nil
        }
    }
}

// MARK: - Fila

private struct MapLibraryRow: View {
    let row: MapLibraryViewModel.Row
    let isBusy: Bool
    let onArchive: () -> Void
    let onDelete: () -> Void

    @Environment(SessionStore.self) private var session
    @Environment(AppSettings.self) private var settings

    private var map: LibraryMap { row.map }

    private var canManage: Bool {
        session.isAdmin || (map.createdBy != nil && map.createdBy == session.currentUser?.id)
    }

    var body: some View {
        HStack(spacing: 10) {
            thumbnail

            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 4) {
                    if row.isLayer {
                        Image(systemName: "arrow.turn.down.right").font(.caption2).foregroundStyle(.secondary)
                    }
                    if map.isArchived {
                        Image(systemName: "archivebox").font(.caption2).foregroundStyle(.secondary)
                    }
                    Text(map.name).font(.subheadline.weight(.medium)).lineLimit(1)
                }
                Text(map.createdByUsername.map { "Por \($0)" } ?? "Sistema")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Spacer(minLength: 8)

            if isBusy {
                ProgressView().controlSize(.small)
            } else if canManage && !map.isSystem {
                HStack(spacing: 6) {
                    Button {
                        onArchive()
                    } label: {
                        Image(systemName: map.isArchived ? "tray.and.arrow.up" : "archivebox")
                    }
                    .help(map.isArchived ? "Restaurar" : "Archivar")

                    Button(role: .destructive) {
                        onDelete()
                    } label: {
                        Image(systemName: "trash")
                    }
                    .help("Borrar")
                }
                .buttonStyle(.borderless)
            }
        }
        .padding(10)
        .opacity(map.isArchived ? 0.6 : 1)
        .padding(.leading, row.isLayer ? 20 : 0)
        .background(Theme.panel, in: RoundedRectangle(cornerRadius: 10))
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(Theme.cardBorder, lineWidth: 1))
    }

    @ViewBuilder
    private var thumbnail: some View {
        if let url = settings.mediaURL(map.thumbURL ?? map.fileURL) {
            AsyncImage(url: url) { phase in
                switch phase {
                case .success(let image):
                    image.resizable().scaledToFill()
                default:
                    placeholder
                }
            }
            .frame(width: 56, height: 38)
            .clipShape(RoundedRectangle(cornerRadius: 6))
        } else {
            placeholder
        }
    }

    private var placeholder: some View {
        RoundedRectangle(cornerRadius: 6)
            .fill(Theme.chip)
            .frame(width: 56, height: 38)
            .overlay { Image(systemName: "map").font(.caption).foregroundStyle(.secondary) }
    }
}
