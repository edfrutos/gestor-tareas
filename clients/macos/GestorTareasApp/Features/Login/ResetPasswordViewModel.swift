import Foundation
import Observation

@MainActor
@Observable
final class ResetPasswordViewModel {
    var isLoading = false
    var errorMessage: String?
    var didSucceed = false

    func submit(pastedToken: String,
                newPassword: String,
                confirmPassword: String,
                settings: AppSettings,
                session: SessionStore) async {
        errorMessage = nil

        guard let token = ResetTokenParsing.token(from: pastedToken) else {
            errorMessage = "No se reconoce el enlace o el código. Pega el que recibiste por email."
            return
        }
        guard newPassword.count >= 6 else {
            errorMessage = "La contraseña debe tener al menos 6 caracteres."
            return
        }
        guard newPassword == confirmPassword else {
            errorMessage = "Las contraseñas no coinciden."
            return
        }

        isLoading = true
        defer { isLoading = false }

        let api = GestorAPI(settings: settings, session: session)
        do {
            try await api.resetPassword(token: token, password: newPassword)
            didSucceed = true
        } catch let error as APIError {
            errorMessage = error.message
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
