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

    /// URL relativa (`/uploads/thumbs/...`) de la foto de perfil, o `nil`.
    var avatarThumbURL: String?
    var isUploadingAvatar = false
    var avatarError: String?

    // Borrado de cuenta (self-service)
    var deleteAccountPassword = ""
    var isDeletingAccount = false
    var deleteAccountError: String?
    var didDeleteAccount = false

    init(user: SessionUser) {
        email = user.email ?? ""
        avatarThumbURL = user.avatarThumbURL
    }

    /// Sube (o reemplaza) la foto de perfil y refresca `SessionStore`.
    func uploadAvatar(_ attachment: Attachment, settings: AppSettings, session: SessionStore) async {
        avatarError = nil
        isUploadingAvatar = true
        defer { isUploadingAvatar = false }

        let api = GestorAPI(settings: settings, session: session)
        do {
            let response = try await api.uploadAvatar(attachment)
            avatarThumbURL = response.avatarThumbURL
            if var user = session.currentUser {
                user.avatarURL = response.avatarURL
                user.avatarThumbURL = response.avatarThumbURL
                session.updateCurrentUser(user)
            }
        } catch let error as APIError {
            avatarError = friendlyMessage(for: error)
        } catch {
            avatarError = error.localizedDescription
        }
    }

    /// Quita la foto de perfil actual y refresca `SessionStore`.
    func removeAvatar(settings: AppSettings, session: SessionStore) async {
        avatarError = nil
        isUploadingAvatar = true
        defer { isUploadingAvatar = false }

        let api = GestorAPI(settings: settings, session: session)
        do {
            try await api.deleteAvatar()
            avatarThumbURL = nil
            if var user = session.currentUser {
                user.avatarURL = nil
                user.avatarThumbURL = nil
                session.updateCurrentUser(user)
            }
        } catch let error as APIError {
            avatarError = friendlyMessage(for: error)
        } catch {
            avatarError = error.localizedDescription
        }
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

    /// Borra la cuenta del usuario (self-service) y cierra sesión localmente
    /// si el backend confirma el borrado.
    func deleteAccount(settings: AppSettings, session: SessionStore) async {
        deleteAccountError = nil
        guard !deleteAccountPassword.isEmpty else {
            deleteAccountError = "Introduce tu contraseña para confirmar."
            return
        }

        isDeletingAccount = true
        defer { isDeletingAccount = false }

        let api = GestorAPI(settings: settings, session: session)
        do {
            try await api.deleteMe(password: deleteAccountPassword)
            didDeleteAccount = true
            session.signOut()
        } catch let error as APIError {
            deleteAccountError = friendlyMessage(for: error)
        } catch {
            deleteAccountError = error.localizedDescription
        }
    }

    private func friendlyMessage(for error: APIError) -> String {
        if !error.validationMessages.isEmpty {
            return error.validationMessages.joined(separator: "\n")
        }
        return error.message
    }
}
