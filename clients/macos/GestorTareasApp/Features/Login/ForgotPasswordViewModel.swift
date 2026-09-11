import Foundation
import Observation

@MainActor
@Observable
final class ForgotPasswordViewModel {
    var isLoading = false
    var errorMessage: String?
    /// El backend responde `200` siempre, sin decir si el email existe.
    var didSubmit = false

    func submit(email: String, settings: AppSettings, session: SessionStore) async {
        let trimmed = email.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            errorMessage = "Escribe tu email."
            return
        }
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        let api = GestorAPI(settings: settings, session: session)
        do {
            try await api.forgotPassword(email: trimmed)
            didSubmit = true
        } catch let error as APIError {
            errorMessage = error.message
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
