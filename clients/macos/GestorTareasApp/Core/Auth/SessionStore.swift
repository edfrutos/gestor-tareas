import Foundation
import Observation

/// Estado de sesión de la app. Persiste el JWT en el llavero y el usuario en `UserDefaults`.
@MainActor
@Observable
final class SessionStore: TokenProviding {

    enum State: Equatable {
        case signedOut
        case signedIn(SessionUser)
    }

    private(set) var state: State
    /// Mensaje transitorio para la UI (p. ej. "sesión caducada").
    var notice: String?

    private let keychain = KeychainService(service: "com.edefrutos.gestortareas")
    private let tokenAccount = "jwt"
    private let userKey = "session.user"

    init() {
        if let token = keychain.get(tokenAccount), !token.isEmpty,
           let data = UserDefaults.standard.data(forKey: userKey),
           let user = try? JSONDecoder().decode(SessionUser.self, from: data) {
            state = .signedIn(user)
        } else {
            state = .signedOut
        }
    }

    // MARK: Acciones

    func signIn(token: String, user: SessionUser) {
        keychain.set(token, for: tokenAccount)
        if let data = try? JSONEncoder().encode(user) {
            UserDefaults.standard.set(data, forKey: userKey)
        }
        notice = nil
        state = .signedIn(user)
    }

    func signOut() {
        keychain.delete(tokenAccount)
        UserDefaults.standard.removeObject(forKey: userKey)
        state = .signedOut
    }

    /// Refresca los datos del usuario en sesión (tras editar "Mi perfil"),
    /// sin tocar el JWT — solo cambia email/username/rol, no la autenticación.
    func updateCurrentUser(_ user: SessionUser) {
        if let data = try? JSONEncoder().encode(user) {
            UserDefaults.standard.set(data, forKey: userKey)
        }
        state = .signedIn(user)
    }

    // MARK: Derivados

    var currentUser: SessionUser? {
        if case let .signedIn(user) = state { return user }
        return nil
    }

    var isAdmin: Bool { currentUser?.isAdmin ?? false }

    // MARK: TokenProviding

    /// Lectura no aislada: el llavero es seguro para hilos y no toca estado observado.
    nonisolated var authToken: String? {
        KeychainService(service: "com.edefrutos.gestortareas").get("jwt")
    }

    nonisolated func handleUnauthorized() async {
        await MainActor.run {
            self.notice = "Tu sesión ha caducado. Vuelve a iniciar sesión."
            self.signOut()
        }
    }
}
