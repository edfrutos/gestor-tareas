import Foundation
import Observation

@MainActor
@Observable
final class ContactViewModel {
    var name: String
    var email: String
    var subject = ""
    var message = ""

    var isLoading = false
    var errorMessage: String?
    var didSend = false

    /// Con sesión se precargan nombre y email; desde el login llegan vacíos.
    init(user: SessionUser?) {
        name = user?.username ?? ""
        email = user?.email ?? ""
    }

    /// Mismas reglas que el backend (`contact.routes.js`), para avisar antes de enviar.
    var canSubmit: Bool {
        !isLoading
            && !trimmed(name).isEmpty
            && trimmed(email).contains("@")
            && !trimmed(subject).isEmpty
            && trimmed(message).count >= 10
    }

    func submit(settings: AppSettings, session: SessionStore) async {
        guard canSubmit else {
            errorMessage = "Rellena todos los campos (el mensaje, al menos 10 caracteres)."
            return
        }
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        let api = GestorAPI(settings: settings, session: session)
        do {
            try await api.sendContact(name: trimmed(name),
                                      email: trimmed(email),
                                      subject: trimmed(subject),
                                      message: trimmed(message))
            didSend = true
        } catch let error as APIError where error.kind == .rateLimited {
            errorMessage = "Has enviado demasiados mensajes. Inténtalo más tarde."
        } catch let error as APIError {
            errorMessage = error.message
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func trimmed(_ value: String) -> String {
        value.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
