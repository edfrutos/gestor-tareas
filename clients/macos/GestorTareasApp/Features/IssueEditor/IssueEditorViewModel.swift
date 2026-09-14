import Foundation
import Observation

@MainActor
@Observable
final class IssueEditorViewModel {
    let mode: IssueEditorMode
    var draft: IssueDraft

    var categories: [String] = []
    var assignees: [UserRef] = []
    var maps: [MapRef] = []

    var isLoadingReferenceData = false
    var isUploadingMap = false
    var mapUploadError: String?
    var isSubmitting = false
    /// Errores de validación local (solo al crear).
    var problems: [String] = []
    /// Error devuelto por el servidor o de red.
    var errorMessage: String?

    /// Límite de subida del backend: `MAX_UPLOAD_BYTES` (def. 8 MiB en
    /// `src/routes/issues.routes.js`). Lo comprobamos en cliente para evitar el
    /// viaje de ida y vuelta; si el servidor está configurado con un límite menor,
    /// mostraremos igualmente su mensaje.
    static let maxUploadBytes = 8 * 1024 * 1024

    init(mode: IssueEditorMode) {
        self.mode = mode
        switch mode {
        case .create:
            draft = IssueDraft()
        case let .edit(issue):
            draft = .forEditing(issue)
        }
    }

    var navigationTitle: String { mode.isEditing ? "Editar tarea" : "Nueva tarea" }
    var submitLabel: String { mode.isEditing ? "Guardar cambios" : "Crear tarea" }

    // MARK: Datos de referencia

    func loadReferenceData(settings: AppSettings, session: SessionStore) async {
        guard categories.isEmpty, assignees.isEmpty, maps.isEmpty else { return }
        isLoadingReferenceData = true
        defer { isLoadingReferenceData = false }

        let api = GestorAPI(settings: settings, session: session)
        async let categoriesResult = api.categories()
        async let assigneesResult = api.usersForAssign()
        async let mapsResult = api.maps()

        categories = (try? await categoriesResult) ?? []
        assignees = (try? await assigneesResult) ?? []
        maps = ((try? await mapsResult) ?? []).filter { $0.parentID == nil }
    }

    /// Sube un plano nuevo a la biblioteca y lo deja seleccionado en el
    /// desplegable, listo para usar en esta tarea (y en cualquier otra futura).
    func uploadMap(name: String, image: Attachment, settings: AppSettings, session: SessionStore) async {
        mapUploadError = nil
        isUploadingMap = true
        defer { isUploadingMap = false }

        let api = GestorAPI(settings: settings, session: session)
        do {
            let newMap = try await api.createMap(name: name, image: image)
            maps.insert(newMap, at: 0)
            draft.mapID = newMap.id
        } catch let error as APIError {
            mapUploadError = friendlyMessage(for: error)
        } catch {
            mapUploadError = error.localizedDescription
        }
    }

    // MARK: Envío

    /// Devuelve la tarea creada/actualizada si la operación tuvo éxito; `nil` si
    /// hubo un problema (mensaje en `problems` / `errorMessage`).
    func submit(settings: AppSettings, session: SessionStore) async -> Issue? {
        problems = []
        errorMessage = nil

        if let oversized = oversizedAttachmentName {
            errorMessage = "«\(oversized)» supera el límite de \(Self.maxUploadBytes / (1024 * 1024)) MB."
            return nil
        }

        let api = GestorAPI(settings: settings, session: session)
        isSubmitting = true
        defer { isSubmitting = false }

        do {
            switch mode {
            case .create:
                problems = draft.creationProblems
                guard problems.isEmpty else { return nil }
                return try await api.createIssue(draft)

            case let .edit(issue):
                let form = draft.makeUpdateForm(original: issue)
                guard !form.isEmpty else {
                    errorMessage = "No has hecho ningún cambio."
                    return nil
                }
                return try await api.updateIssue(id: issue.id, form: form)
            }
        } catch let error as APIError {
            errorMessage = friendlyMessage(for: error)
            return nil
        } catch {
            errorMessage = error.localizedDescription
            return nil
        }
    }

    // MARK: Utilidades

    private var attachments: [Attachment] {
        [draft.photo, draft.document, draft.resolutionPhoto, draft.resolutionDocument]
            .compactMap { $0 }
    }

    private var oversizedAttachmentName: String? {
        attachments.first { $0.byteCount > Self.maxUploadBytes }?.filename
    }

    private func friendlyMessage(for error: APIError) -> String {
        if error.isUploadRejected {
            return "El archivo supera el límite de \(Self.maxUploadBytes / (1024 * 1024)) MB "
                + "o su formato no está permitido (imágenes: JPG, PNG, WebP, GIF; "
                + "documentos: PDF, TXT, MD)."
        }
        if error.kind == .forbidden {
            return error.message.isEmpty
                ? "No puedes editar esta tarea: no eres su autor, ni la persona asignada, ni administrador."
                : error.message
        }
        if !error.validationMessages.isEmpty {
            return error.validationMessages.joined(separator: "\n")
        }
        return error.message
    }
}
