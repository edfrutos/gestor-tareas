import Foundation
import Observation

/// Formulario de "Mi perfil" (`PATCH /v1/auth/me`): el propio usuario cambia
/// su email y/o contraseña. Distinto de `AdminUserEditorViewModel`, que es
/// para que un admin edite a OTROS usuarios (`PATCH /v1/users/:id`).
@MainActor
@Observable
final class ProfileViewModel {
    var email: String
    var currentPassword = ""
    var newPassword = ""

    var isSubmitting = false
    var errorMessage: String?
    var didSave = false

    init(user: SessionUser) {
        email = user.email ?? ""
    }

    func submit(settings: AppSettings, session: SessionStore) async {
        errorMessage = nil
        didSave = false
        guard let current = session.currentUser else { return }

        let trimmedEmail = email.trimmingCharacters(in: .whitespacesAndNewlines)
        let emailChanged = trimmedEmail != (current.email ?? "")
        let wantsPasswordChange = !newPassword.isEmpty

        guard emailChanged || wantsPasswordChange else {
            errorMessage = "No has hecho ningún cambio."
            return
        }
        if wantsPasswordChange {
            guard newPassword.count >= 6 else {
                errorMessage = "La nueva contraseña debe tener al menos 6 caracteres."
                return
            }
            guard !currentPassword.isEmpty else {
                errorMessage = "Introduce tu contraseña actual para establecer una nueva."
                return
            }
        }

        isSubmitting = true
        defer { isSubmitting = false }

        let api = GestorAPI(settings: settings, session: session)
        do {
            try await api.updateMe(
                email: emailChanged ? trimmedEmail : nil,
                currentPassword: wantsPasswordChange ? currentPassword : nil,
                newPassword: wantsPasswordChange ? newPassword : nil
            )
            // El PATCH solo devuelve { ok: true }: pedimos el usuario fresco
            // para reflejar el cambio en SessionStore/UI (menú de cuenta).
            let refreshed = try await api.me()
            session.updateCurrentUser(refreshed)
            currentPassword = ""
            newPassword = ""
            didSave = true
        } catch let error as APIError {
            errorMessage = friendlyMessage(for: error)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func friendlyMessage(for error: APIError) -> String {
        if !error.validationMessages.isEmpty {
            return error.validationMessages.joined(separator: "\n")
        }
        return error.message
    }
}
