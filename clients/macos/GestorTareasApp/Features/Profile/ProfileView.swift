import SwiftUI

/// "Mi perfil": el propio usuario cambia su email/contraseña.
/// Distinto de `AdminUserEditorView`, que es para que un admin edite a OTROS
/// usuarios. Sin foto de perfil por ahora: el backend no tiene esa columna
/// todavía (ver docs/PLAN_APP_MACOS.md).
struct ProfileView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(SessionStore.self) private var session
    @Environment(AppSettings.self) private var settings
    @State private var model: ProfileViewModel

    init(user: SessionUser) {
        _model = State(wrappedValue: ProfileViewModel(user: user))
    }

    var body: some View {
        @Bindable var model = model

        VStack(spacing: 0) {
            HStack {
                Text("Mi perfil").font(.headline)
                Spacer()
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            Divider()

            Form {
                Section("Cuenta") {
                    if let username = session.currentUser?.username {
                        LabeledContent("Usuario", value: username)
                    }
                    TextField("Email", text: $model.email)
                        .textContentType(.emailAddress)
                }
                Section("Cambiar contraseña") {
                    SecureField("Contraseña actual", text: $model.currentPassword)
                        .textContentType(.password)
                    SecureField("Nueva contraseña (dejar en blanco para no cambiarla)",
                               text: $model.newPassword)
                        .textContentType(.newPassword)
                }
            }
            .formStyle(.grouped)

            Divider()
            footer
        }
        .frame(width: 440, height: 340)
    }

    private var footer: some View {
        VStack(alignment: .leading, spacing: 8) {
            if model.didSave {
                Label("Perfil actualizado.", systemImage: "checkmark.circle")
                    .font(.callout)
                    .foregroundStyle(.green)
            }
            if let error = model.errorMessage {
                Label(error, systemImage: "exclamationmark.triangle")
                    .font(.callout)
                    .foregroundStyle(.red)
            }
            HStack {
                Spacer()
                Button("Cerrar", role: .cancel) { dismiss() }
                    .keyboardShortcut(.cancelAction)
                Button(action: save) {
                    if model.isSubmitting {
                        ProgressView().controlSize(.small)
                    } else {
                        Text("Guardar cambios")
                    }
                }
                .keyboardShortcut(.defaultAction)
                .buttonStyle(.borderedProminent)
                .disabled(model.isSubmitting)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }

    private func save() {
        Task { await model.submit(settings: settings, session: session) }
    }
}
