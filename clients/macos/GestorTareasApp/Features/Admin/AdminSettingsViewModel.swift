import Foundation
import Observation

@MainActor
@Observable
final class AdminSettingsViewModel {
    private(set) var original = AppRuntimeSettings()

    var maxUploadBytes = ""
    var rateLimitEnabled = false
    var rateLimitWindowMs = ""
    var rateLimitMax = ""
    var adminEmail = ""
    var publicURL = ""
    var mailpitURL = ""

    var isLoading = false
    var isSaving = false
    var errorMessage: String?
    var didSave = false

    func load(settings: AppSettings, session: SessionStore) async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        let api = GestorAPI(settings: settings, session: session)
        do {
            apply(try await api.settings())
        } catch let error as APIError {
            errorMessage = error.message
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// Solo envía las claves que realmente cambiaron respecto a `original`
    /// (`PATCH /v1/settings` es una actualización atómica parcial).
    func save(settings: AppSettings, session: SessionStore) async {
        errorMessage = nil
        didSave = false
        var patch = SettingsPatch()

        if rateLimitEnabled != (original.rateLimitEnabled ?? false) {
            patch.rateLimitEnabled = rateLimitEnabled
        }

        let trimmedMaxUpload = maxUploadBytes.trimmingCharacters(in: .whitespaces)
        if trimmedMaxUpload != (original.maxUploadBytes.map(String.init) ?? "") {
            guard let value = Int(trimmedMaxUpload) else {
                errorMessage = "«Tamaño máximo de subida» debe ser un número entero (bytes)."
                return
            }
            patch.maxUploadBytes = value
        }

        let trimmedWindow = rateLimitWindowMs.trimmingCharacters(in: .whitespaces)
        if trimmedWindow != (original.rateLimitWindowMs.map(String.init) ?? "") {
            guard let value = Int(trimmedWindow) else {
                errorMessage = "«Ventana del límite de peticiones» debe ser un número entero (ms)."
                return
            }
            patch.rateLimitWindowMs = value
        }

        let trimmedMax = rateLimitMax.trimmingCharacters(in: .whitespaces)
        if trimmedMax != (original.rateLimitMax.map(String.init) ?? "") {
            guard let value = Int(trimmedMax) else {
                errorMessage = "«Máximo de peticiones» debe ser un número entero."
                return
            }
            patch.rateLimitMax = value
        }

        let trimmedEmail = adminEmail.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmedEmail != (original.adminEmail ?? "") { patch.adminEmail = trimmedEmail }

        let trimmedPublicURL = publicURL.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmedPublicURL != (original.publicURL ?? "") { patch.publicURL = trimmedPublicURL }

        let trimmedMailpitURL = mailpitURL.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmedMailpitURL != (original.mailpitURL ?? "") { patch.mailpitURL = trimmedMailpitURL }

        guard !patch.isEmpty else {
            errorMessage = "No has hecho ningún cambio."
            return
        }

        isSaving = true
        defer { isSaving = false }

        let api = GestorAPI(settings: settings, session: session)
        do {
            apply(try await api.updateSettings(patch))
            didSave = true
        } catch let error as APIError {
            errorMessage = error.message
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func apply(_ result: AppRuntimeSettings) {
        original = result
        maxUploadBytes = result.maxUploadBytes.map(String.init) ?? ""
        rateLimitEnabled = result.rateLimitEnabled ?? false
        rateLimitWindowMs = result.rateLimitWindowMs.map(String.init) ?? ""
        rateLimitMax = result.rateLimitMax.map(String.init) ?? ""
        adminEmail = result.adminEmail ?? ""
        publicURL = result.publicURL ?? ""
        mailpitURL = result.mailpitURL ?? ""
    }
}
