import Foundation
import Observation

@MainActor
@Observable
final class AdminUserEditorViewModel {
    let mode: AdminUserEditorMode
    var draft: AdminUserDraft

    var isSubmitting = false
    var errorMessage: String?

    init(mode: AdminUserEditorMode) {
        self.mode = mode
        switch mode {
        case .create:
            draft = AdminUserDraft()
        case let .edit(user):
            draft = .forEditing(user)
        }
    }

    var navigationTitle: String { mode.isEditing ? "Editar usuario" : "Nuevo usuario" }
    var submitLabel: String { mode.isEditing ? "Guardar cambios" : "Crear usuario" }

    /// Devuelve el usuario creado/actualizado si la operación tuvo éxito;
    /// `nil` si hubo un problema (mensaje en `errorMessage`).
    func submit(settings: AppSettings, session: SessionStore) async -> AdminUser? {
        errorMessage = nil
        let trimmedEmail = draft.email.trimmingCharacters(in: .whitespacesAndNewlines)
        let api = GestorAPI(settings: settings, session: session)
        isSubmitting = true
        defer { isSubmitting = false }

        do {
            switch mode {
            case .create:
                let trimmedUsername = draft.username.trimmingCharacters(in: .whitespacesAndNewlines)
                guard trimmedUsername.count >= 3 else {
                    errorMessage = "El usuario debe tener al menos 3 caracteres."
                    return nil
                }
                guard draft.password.count >= 6 else {
                    errorMessage = "La contraseña debe tener al menos 6 caracteres."
                    return nil
                }
                return try await api.createUser(username: trimmedUsername,
                                                email: trimmedEmail.isEmpty ? nil : trimmedEmail,
                                                password: draft.password,
                                                role: draft.role)

            case let .edit(user):
                let role: String? = draft.role != user.role ? draft.role : nil
                let email: String? = trimmedEmail != (user.email ?? "") ? trimmedEmail : nil
                let password: String? = draft.password.isEmpty ? nil : draft.password
                if let password, password.count < 6 {
                    errorMessage = "La contraseña debe tener al menos 6 caracteres."
                    return nil
                }
                guard role != nil || email != nil || password != nil else {
                    errorMessage = "No has hecho ningún cambio."
                    return nil
                }
                try await api.updateUser(id: user.id, role: role, email: email, password: password)
                // PATCH /v1/users/:id solo devuelve { ok: true }: reconstruimos
                // localmente el registro con los campos que sí cambiaron.
                return AdminUser(id: user.id,
                                 username: user.username,
                                 email: email ?? user.email,
                                 role: role ?? user.role,
                                 createdAt: user.createdAt)
            }
        } catch let error as APIError {
            errorMessage = friendlyMessage(for: error)
            return nil
        } catch {
            errorMessage = error.localizedDescription
            return nil
        }
    }

    private func friendlyMessage(for error: APIError) -> String {
        if !error.validationMessages.isEmpty {
            return error.validationMessages.joined(separator: "\n")
        }
        return error.message
    }
}
