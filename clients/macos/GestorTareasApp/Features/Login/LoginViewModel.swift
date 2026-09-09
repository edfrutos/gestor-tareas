import Foundation
import Observation

@MainActor
@Observable
final class LoginViewModel {
    var isLoading = false
    var errorMessage: String?

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
}
