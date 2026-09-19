import Foundation
import Observation

@MainActor
@Observable
final class LoginViewModel {
    var isLoading = false
    var errorMessage: String?

    /// Alterna entre "Entrar" y "Crear cuenta" — mismo flujo que el toggle
    /// `lnkRegister` de la web (`app.js`/`initAuth`).
    var isRegisterMode = false

    func login(username: String,
               password: String,
               settings: AppSettings,
               session: SessionStore) async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        guard settings.baseURL != nil else {
            errorMessage = "Configura primero la URL del servidor."
            return
        }

        let api = GestorAPI(settings: settings, session: session)
        do {
            let response = try await api.login(username: username, password: password)
            session.signIn(token: response.token, user: response.user)
        } catch let error as APIError {
            errorMessage = error.message
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// Registra la cuenta y, si sale bien, inicia sesión con las mismas
    /// credenciales (el registro no devuelve token: mismo patrón que la web).
    func register(username: String,
                  email: String,
                  password: String,
                  settings: AppSettings,
                  session: SessionStore) async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        guard settings.baseURL != nil else {
            errorMessage = "Configura primero la URL del servidor."
            return
        }
        guard username.count >= 3 else {
            errorMessage = "El usuario debe tener al menos 3 caracteres."
            return
        }
        guard password.count >= 6 else {
            errorMessage = "La contraseña debe tener al menos 6 caracteres."
            return
        }

        let api = GestorAPI(settings: settings, session: session)
        let trimmedEmail = email.trimmingCharacters(in: .whitespacesAndNewlines)
        do {
            try await api.register(username: username,
                                   email: trimmedEmail.isEmpty ? nil : trimmedEmail,
                                   password: password)
            let response = try await api.login(username: username, password: password)
            session.signIn(token: response.token, user: response.user)
        } catch let error as APIError {
            errorMessage = error.message
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
