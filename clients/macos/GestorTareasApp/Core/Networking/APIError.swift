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

    var errorDescription: String? { message }

    // MARK: Fábricas

    static func transport(_ underlying: Error) -> APIError {
        APIError(kind: .transport, message: underlying.localizedDescription,
                 requestID: nil, validationMessages: [])
    }

    static func transport(message: String) -> APIError {
        APIError(kind: .transport, message: message, requestID: nil, validationMessages: [])
    }

    static var decoding: APIError {
        APIError(kind: .decoding,
                 message: "La respuesta del servidor tiene un formato inesperado.",
                 requestID: nil, validationMessages: [])
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
                        validationMessages: parsed.validation)
    }

    // MARK: Parseo

    private static func parseBody(_ data: Data) -> (message: String?, requestID: String?, validation: [String]) {
        guard !data.isEmpty,
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return (nil, nil, [])
        }

        switch obj["error"] {
        case let text as String:
            return (text, nil, [])

        case let dict as [String: Any]:
            return (dict["message"] as? String, dict["requestId"] as? String, [])

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
            return (messages.first, nil, messages)

        default:
            return (obj["message"] as? String, nil, [])
        }
    }
}
