import Foundation

/// Fichero elegido por el usuario en el `fileImporter` (sandbox). Los bytes se
/// leen en el momento de la selección, mientras el recurso con ámbito de
/// seguridad sigue accesible, y se conservan hasta el envío.
struct Attachment: Identifiable, Equatable {
    let id = UUID()
    let filename: String
    let data: Data

    var fileExtension: String {
        (filename as NSString).pathExtension.lowercased()
    }
    var mimeType: String { MimeType.forExtension(fileExtension) }
    var byteCount: Int { data.count }

    static let imageExtensions: Set<String> = ["jpg", "jpeg", "png", "webp", "gif"]
    static let documentExtensions: Set<String> = ["pdf", "txt", "md", "markdown"]

    var isImage: Bool { Self.imageExtensions.contains(fileExtension) }
}

enum IssueEditorMode: Equatable {
    case create
    case edit(Issue)

    var isEditing: Bool { if case .edit = self { return true } else { return false } }

    var editingIssue: Issue? {
        if case let .edit(issue) = self { return issue }
        return nil
    }
}

/// Estado editable del formulario de tarea. Traduce a `multipart/form-data` con
/// los nombres de campo de `src/routes/issues.routes.js` /
/// `src/schemas/issue.schema.js`.
struct IssueDraft: Equatable {
    var title = ""
    var category = ""
    var details = ""
    var priority: Priority = .medium
    var status: IssueStatus = .open
    var mapID: Int = 1
    var assignedTo: Int?
    var hasDueDate = false
    var dueDate = Date()

    /// Coordenadas sobre el plano (píxeles/técnicas). Obligatorias al crear —
    /// vacías por defecto a propósito: si arrancaran en "0" pasarían la
    /// validación sin que el usuario haya tocado el plano nunca, y la tarea
    /// quedaría con un pin fantasma en la esquina inferior izquierda (origen
    /// del sistema de coordenadas). `MapCoordinatePicker` las rellena al
    /// tocar el plano; también se admiten a mano, con coma o punto decimal.
    var x = ""
    var y = ""

    var photo: Attachment?
    var document: Attachment?
    var resolutionPhoto: Attachment?
    var resolutionDocument: Attachment?

    // MARK: Construcción

    static func forEditing(_ issue: Issue) -> IssueDraft {
        var draft = IssueDraft()
        draft.title = issue.title
        draft.category = issue.category
        draft.details = issue.description
        draft.priority = issue.priority
        draft.status = issue.status
        draft.mapID = issue.mapID ?? 1
        draft.assignedTo = issue.assignedTo
        if let parsed = AppDate.parseDay(issue.dueDate) {
            draft.hasDueDate = true
            draft.dueDate = parsed
        }
        draft.x = issue.lat.map { trimmedNumber($0) } ?? "0"
        draft.y = issue.lng.map { trimmedNumber($0) } ?? "0"
        return draft
    }

    // MARK: Validación

    private var trimmedTitle: String { title.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var trimmedCategory: String { category.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var trimmedDetails: String { details.trimmingCharacters(in: .whitespacesAndNewlines) }

    /// Solo relevante al crear (`title/category/description/lat/lng` obligatorios).
    var creationProblems: [String] {
        var problems: [String] = []
        if trimmedTitle.isEmpty { problems.append("El título es obligatorio.") }
        if trimmedCategory.isEmpty { problems.append("La categoría es obligatoria.") }
        if trimmedDetails.isEmpty { problems.append("La descripción es obligatoria.") }
        if Self.number(from: x) == nil { problems.append("La coordenada X debe ser un número.") }
        if Self.number(from: y) == nil { problems.append("La coordenada Y debe ser un número.") }
        return problems
    }

    // MARK: multipart/form-data

    func makeCreateForm() -> MultipartForm {
        var form = MultipartForm()
        form.addField("title", trimmedTitle)
        form.addField("category", trimmedCategory)
        form.addField("description", trimmedDetails)
        form.addField("lat", normalizedNumberString(x))
        form.addField("lng", normalizedNumberString(y))
        form.addField("map_id", mapID)
        form.addField("assigned_to", assignedTo.map { String($0) } ?? "")
        form.addField("priority", priority.rawValue)
        form.addField("due_date", hasDueDate ? AppDate.iso8601Day(dueDate) : "")
        attach(&form, photo: photo, document: document)
        return form
    }

    /// Solo los campos que cambian respecto al original + los ficheros elegidos.
    /// Si el formulario resultante está vacío, no hay nada que enviar.
    func makeUpdateForm(original: Issue) -> MultipartForm {
        var form = MultipartForm()

        if status != original.status {
            form.addField("status", status.rawValue)
        }
        if !trimmedDetails.isEmpty, trimmedDetails != original.description {
            form.addField("description", trimmedDetails)
        }
        if !trimmedCategory.isEmpty, trimmedCategory != original.category {
            form.addField("category", trimmedCategory)
        }
        if priority != original.priority {
            form.addField("priority", priority.rawValue)
        }
        if mapID != (original.mapID ?? 1) {
            form.addField("map_id", mapID)
        }
        if assignedTo != original.assignedTo {
            form.addField("assigned_to", assignedTo.map { String($0) } ?? "")
        }
        let newDueDate = hasDueDate ? AppDate.iso8601Day(dueDate) : ""
        let oldDueDate = original.dueDate ?? ""
        if newDueDate != oldDueDate {
            form.addField("due_date", newDueDate)
        }

        attach(&form, photo: photo, document: document)
        if let resolutionPhoto {
            form.addFile(.resolutionPhoto, filename: resolutionPhoto.filename,
                         mimeType: resolutionPhoto.mimeType, data: resolutionPhoto.data)
        }
        if let resolutionDocument {
            form.addFile(.resolutionDocument, filename: resolutionDocument.filename,
                         mimeType: resolutionDocument.mimeType, data: resolutionDocument.data)
        }
        return form
    }

    // MARK: Utilidades

    private func attach(_ form: inout MultipartForm, photo: Attachment?, document: Attachment?) {
        if let photo {
            form.addFile(.photo, filename: photo.filename, mimeType: photo.mimeType, data: photo.data)
        }
        if let document {
            form.addFile(.document, filename: document.filename, mimeType: document.mimeType, data: document.data)
        }
    }

    private func normalizedNumberString(_ raw: String) -> String {
        String(Self.number(from: raw) ?? 0)
    }

    static func number(from raw: String) -> Double? {
        Double(raw.trimmingCharacters(in: .whitespaces).replacingOccurrences(of: ",", with: "."))
    }

    private static func trimmedNumber(_ value: Double) -> String {
        value == value.rounded() ? String(Int(value)) : String(value)
    }
}
