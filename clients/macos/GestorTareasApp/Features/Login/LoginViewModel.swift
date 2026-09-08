import Foundation
import Observation

@MainActor
@Observable
final class LoginViewModel {
    var isLoading = false
    var errorMessage: String?

    private struct Credentials: Encodable {
        let username: String
        let password: String
    }

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

        let client = APIClient(baseURL: settings.baseURL, tokenProvider: session)
        let request = APIClient.Request.json(
            "POST", "/v1/auth/login",
            body: Credentials(username: username, password: password),
            authorized: false
        )

        do {
            let response: LoginResponse = try await client.send(request)
            session.signIn(token: response.token, user: response.user)
        } catch let error as APIError {
            errorMessage = error.message
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
