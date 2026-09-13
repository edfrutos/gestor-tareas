import Foundation

/// Construye un cuerpo `multipart/form-data` para los endpoints de escritura de
/// tareas (`POST`/`PATCH /v1/issues`), que el backend sirve con `multer`.
///
/// Uso:
/// ```swift
/// var form = MultipartForm()
/// form.addField("title", "Farola rota")
/// form.addFile("photo", filename: "foto.jpg", mimeType: "image/jpeg", data: data)
/// let (body, contentType) = form.finalize()
/// ```
struct MultipartForm {
    /// Nombres de campo de fichero que acepta `uploadMiddleware` del backend
    /// (`src/routes/issues.routes.js`).
    enum FileField: String {
        case photo
        case document = "file"
        case resolutionPhoto = "resolution_photo"
        case resolutionDocument = "resolution_doc"
        /// `POST /v1/auth/me/avatar` (`src/routes/auth.routes.js`).
        case avatar
    }

    private let boundary = "Boundary-\(UUID().uuidString)"
    private var body = Data()
    private(set) var isEmpty = true

    var contentType: String { "multipart/form-data; boundary=\(boundary)" }

    /// Añade un campo de texto. Los valores vacíos también se envían: el backend
    /// los interpreta (p. ej. `assigned_to=""` → desasignar, `due_date=""` → sin fecha).
    mutating func addField(_ name: String, _ value: String) {
        appendBoundary()
        append("Content-Disposition: form-data; name=\"\(name)\"\r\n\r\n")
        append(value)
        append("\r\n")
        isEmpty = false
    }

    mutating func addField(_ name: String, _ value: Int) {
        addField(name, String(value))
    }

    mutating func addFile(_ field: FileField,
                          filename: String,
                          mimeType: String,
                          data: Data) {
        appendBoundary()
        append("Content-Disposition: form-data; name=\"\(field.rawValue)\"; filename=\"\(filename)\"\r\n")
        append("Content-Type: \(mimeType)\r\n\r\n")
        body.append(data)
        append("\r\n")
        isEmpty = false
    }

    /// Cierra el cuerpo. Debe llamarse una sola vez, justo antes de enviar.
    mutating func finalize() -> (body: Data, contentType: String) {
        append("--\(boundary)--\r\n")
        return (body, contentType)
    }

    // MARK: Privado

    private mutating func appendBoundary() {
        append("--\(boundary)\r\n")
    }

    private mutating func append(_ string: String) {
        body.append(Data(string.utf8))
    }
}

/// Deduce un `Content-Type` a partir de la extensión del fichero elegido en el
/// `fileImporter` (sandbox). El backend solo valida por extensión/MIME de una
/// lista corta, así que esta tabla basta.
enum MimeType {
    static func forExtension(_ ext: String) -> String {
        switch ext.lowercased() {
        case "jpg", "jpeg": return "image/jpeg"
        case "png": return "image/png"
        case "webp": return "image/webp"
        case "gif": return "image/gif"
        case "pdf": return "application/pdf"
        case "txt": return "text/plain"
        case "md", "markdown": return "text/markdown"
        default: return "application/octet-stream"
        }
    }
}
