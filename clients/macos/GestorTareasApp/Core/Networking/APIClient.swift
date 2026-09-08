import Foundation

/// Fuente del token JWT y punto de reacción ante un 401. Lo implementa `SessionStore`.
protocol TokenProviding: AnyObject {
    var authToken: String? { get }
    func handleUnauthorized() async
}

/// Cliente HTTP tipado sobre `URLSession` + `async/await`.
///
/// Se crea de forma efímera para cada operación desde un contexto `@MainActor`
/// (los view models), que resuelve `baseURL` y pasa el `tokenProvider`.
final class APIClient {

    struct Request {
        var method: String = "GET"
        var path: String
        var query: [URLQueryItem] = []
        var body: Data?
        var contentType: String?
        var authorized: Bool = true

        /// Atajo para peticiones con cuerpo JSON.
        static func json(_ method: String,
                         _ path: String,
                         body: (any Encodable)? = nil,
                         query: [URLQueryItem] = [],
                         authorized: Bool = true) -> Request {
            var data: Data?
            if let body {
                data = try? JSONEncoder().encode(AnyEncodable(body))
            }
            return Request(method: method,
                           path: path,
                           query: query,
                           body: data,
                           contentType: data == nil ? nil : "application/json",
                           authorized: authorized)
        }
    }

    private let session: URLSession
    private let baseURL: URL?
    private weak var tokenProvider: TokenProviding?
    private let decoder = JSONDecoder()

    init(baseURL: URL?,
         tokenProvider: TokenProviding?,
         session: URLSession = .shared) {
        self.baseURL = baseURL
        self.tokenProvider = tokenProvider
        self.session = session
    }

    // MARK: API pública

    func send<T: Decodable>(_ request: Request, as type: T.Type = T.self) async throws -> T {
        let data = try await raw(request)
        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            throw APIError.decoding
        }
    }

    @discardableResult
    func sendVoid(_ request: Request) async throws -> Data {
        try await raw(request)
    }

    // MARK: Implementación

    private func raw(_ request: Request) async throws -> Data {
        guard let baseURL else {
            throw APIError.transport(message: "No hay ningún servidor configurado.")
        }

        var components = URLComponents(
            url: baseURL.appendingPathComponent(request.path),
            resolvingAgainstBaseURL: false
        )
        if !request.query.isEmpty {
            components?.queryItems = request.query
        }
        guard let url = components?.url else {
            throw APIError.transport(message: "URL de petición inválida.")
        }

        var urlRequest = URLRequest(url: url)
        urlRequest.httpMethod = request.method
        urlRequest.httpBody = request.body
        urlRequest.setValue("application/json", forHTTPHeaderField: "Accept")
        if let contentType = request.contentType {
            urlRequest.setValue(contentType, forHTTPHeaderField: "Content-Type")
        }
        if request.authorized, let token = tokenProvider?.authToken, !token.isEmpty {
            urlRequest.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: urlRequest)
        } catch {
            throw APIError.transport(error)
        }

        guard let http = response as? HTTPURLResponse else {
            throw APIError.decoding
        }

        switch http.statusCode {
        case 200...299:
            return data
        case 401:
            await tokenProvider?.handleUnauthorized()
            throw APIError.from(status: 401, data: data)
        default:
            throw APIError.from(status: http.statusCode, data: data)
        }
    }
}

/// Envoltorio para poder codificar un `any Encodable` heterogéneo.
struct AnyEncodable: Encodable {
    private let encodeClosure: (Encoder) throws -> Void
    init(_ wrapped: any Encodable) {
        self.encodeClosure = wrapped.encode
    }
    func encode(to encoder: Encoder) throws {
        try encodeClosure(encoder)
    }
}
