import Foundation

/// Error de red/API con decodificación tolerante de los tres formatos de error del backend
/// (ver `docs/API.md §5`):
///   1. `{ "error": { "code", "message", "requestId" } }`
///   2. `{ "error": "texto" }`
///   3. `{ "error": [ { "path": [...], "message": "..." } ] }`  (validación Zod)
struct APIError: LocalizedError, Equatable {
    enum Kind: Equatable {
        case transport
        case decoding
        case unauthorized
        case forbidden
        case notFound
        case rateLimited
        case server(status: Int)
    }

    let kind: Kind
    let message: String
    let requestID: String?
    let validationMessages: [String]
    /// `code` de la forma A (`{ error: { code } }`), p. ej. `"upload_error"`, `"forbidden"`.
    let code: String?

    var errorDescription: String? { message }

    /// El fichero adjunto es demasiado grande o de un tipo no admitido. El backend
    /// de tareas devuelve esto como `400 { error: { code: "upload_error" } }`
    /// (multer), no como `413`; contemplamos ambos.
    var isUploadRejected: Bool {
        code == "upload_error" || kind == .server(status: 413)
    }

    // MARK: Fábricas

    static func transport(_ underlying: Error) -> APIError {
        APIError(kind: .transport, message: underlying.localizedDescription,
                 requestID: nil, validationMessages: [], code: nil)
    }

    static func transport(message: String) -> APIError {
        APIError(kind: .transport, message: message,
                 requestID: nil, validationMessages: [], code: nil)
    }

    static var decoding: APIError {
        APIError(kind: .decoding,
                 message: "La respuesta del servidor tiene un formato inesperado.",
                 requestID: nil, validationMessages: [], code: nil)
    }

    static func from(status: Int, data: Data) -> APIError {
        let parsed = parseBody(data)

        let kind: Kind
        let fallback: String
        switch status {
        case 401:
            kind = .unauthorized
            fallback = "Sesión no válida o caducada."
        case 403:
            kind = .forbidden
            fallback = "No tienes permisos para esta acción."
        case 404:
            kind = .notFound
            fallback = "Recurso no encontrado."
        case 413:
            kind = .server(status: status)
            fallback = "El archivo es demasiado grande."
        case 429:
            kind = .rateLimited
            fallback = "Demasiadas peticiones. Espera un momento."
        default:
            kind = .server(status: status)
            fallback = "Error del servidor (\(status))."
        }

        return APIError(kind: kind,
                        message: parsed.message ?? fallback,
                        requestID: parsed.requestID,
                        validationMessages: parsed.validation,
                        code: parsed.code)
    }

    // MARK: Parseo

    private static func parseBody(_ data: Data) -> (message: String?, requestID: String?, validation: [String], code: String?) {
        guard !data.isEmpty,
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return (nil, nil, [], nil)
        }

        switch obj["error"] {
        case let text as String:
            return (text, nil, [], nil)

        case let dict as [String: Any]:
            return (dict["message"] as? String,
                    dict["requestId"] as? String,
                    [],
                    dict["code"] as? String)

        case let array as [[String: Any]]:
            let messages: [String] = array.compactMap { entry in
                let field = (entry["path"] as? [Any])?
                    .map { "\($0)" }
                    .joined(separator: ".") ?? ""
                let msg = entry["message"] as? String
                switch (field.isEmpty, msg) {
                case (false, let m?): return "\(field): \(m)"
                case (true, let m?): return m
                default: return nil
                }
            }
            return (messages.first, nil, messages, nil)

        default:
            return (obj["message"] as? String, nil, [], nil)
        }
    }
}
