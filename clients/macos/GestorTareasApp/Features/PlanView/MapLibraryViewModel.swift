import Observation

@MainActor
@Observable
final class MapLibraryViewModel {
    var items: [LibraryMap] = []
    var includeArchived = false
    var isLoading = false
    var errorMessage: String?

    /// ID del plano que se está archivando/restaurando o borrando ahora mismo,
    /// para deshabilitar solo sus botones mientras dura la petición.
    var busyMapID: Int?

    var isUploading = false
    var uploadError: String?

    func load(settings: AppSettings, session: SessionStore) async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        let api = GestorAPI(settings: settings, session: session)
        do {
            items = try await api.mapLibrary(includeArchived: includeArchived)
        } catch let error as APIError {
            errorMessage = error.message
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func toggleArchived(_ map: LibraryMap, settings: AppSettings, session: SessionStore) async {
        busyMapID = map.id
        defer { busyMapID = nil }
        let api = GestorAPI(settings: settings, session: session)
        do {
            let updated = try await api.archiveMap(id: map.id, archived: !map.isArchived)
            if let index = items.firstIndex(where: { $0.id == updated.id }) {
                items[index] = updated
            }
            if !includeArchived, updated.isArchived {
                items.removeAll { $0.id == updated.id }
            }
        } catch let error as APIError {
            errorMessage = error.kind == .forbidden
                ? "No puedes archivar este plano: no eres su autor ni administrador."
                : error.message
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func delete(_ map: LibraryMap, settings: AppSettings, session: SessionStore) async {
        busyMapID = map.id
        defer { busyMapID = nil }
        let api = GestorAPI(settings: settings, session: session)
        do {
            try await api.deleteMap(id: map.id)
            items.removeAll { $0.id == map.id || $0.parentID == map.id }
        } catch let error as APIError {
            errorMessage = error.kind == .forbidden
                ? "No puedes borrar este plano: no eres su autor ni administrador."
                : error.message
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func upload(name: String, image: Attachment, settings: AppSettings, session: SessionStore) async {
        isUploading = true
        uploadError = nil
        defer { isUploading = false }
        let api = GestorAPI(settings: settings, session: session)
        do {
            _ = try await api.createMap(name: name, image: image)
            await load(settings: settings, session: session)
        } catch let error as APIError {
            uploadError = error.message
        } catch {
            uploadError = error.localizedDescription
        }
    }

    /// Agrupa jerárquicamente: cada plano base seguido de sus capas (mismo
    /// criterio que `maps.js::renderMapsList`), con las capas huérfanas
    /// (padre archivado/no visible con el filtro actual) al final.
    struct Row: Identifiable {
        let map: LibraryMap
        let isLayer: Bool
        var id: Int { map.id }
    }

    var groupedRows: [Row] {
        let bases = items.filter { $0.parentID == nil }
        let layers = items.filter { $0.parentID != nil }
        var rows: [Row] = []
        for base in bases {
            rows.append(Row(map: base, isLayer: false))
            for layer in layers where layer.parentID == base.id {
                rows.append(Row(map: layer, isLayer: true))
            }
        }
        for layer in layers where !bases.contains(where: { $0.id == layer.parentID }) {
            rows.append(Row(map: layer, isLayer: false))
        }
        return rows
    }
}
