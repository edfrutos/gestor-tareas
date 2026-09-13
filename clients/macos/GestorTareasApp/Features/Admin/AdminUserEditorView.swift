import SwiftUI

/// Formulario de creación/edición de usuario, presentado como hoja desde
/// `AdminUsersView`. Solo accesible con `session.isAdmin`.
struct AdminUserEditorView: View {
    let mode: AdminUserEditorMode
    var onSaved: (AdminUser) -> Void

    @Environment(\.dismiss) private var dismiss
    @Environment(SessionStore.self) private var session
    @Environment(AppSettings.self) private var settings
    @State private var model: AdminUserEditorViewModel

    init(mode: AdminUserEditorMode, onSaved: @escaping (AdminUser) -> Void) {
        self.mode = mode
        self.onSaved = onSaved
        _model = State(wrappedValue: AdminUserEditorViewModel(mode: mode))
    }

    var body: some View {
        @Bindable var model = model

        VStack(spacing: 0) {
            HStack {
                Text(model.navigationTitle).font(.headline)
                Spacer()
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            Divider()

            Form {
                Section("Cuenta") {
                    TextField("Usuario", text: $model.draft.username)
                        .disabled(mode.isEditing)
                    if mode.isEditing {
                        Text("El nombre de usuario no se puede cambiar.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    TextField("Email", text: $model.draft.email)
                        .textContentType(.emailAddress)
                    Picker("Rol", selection: $model.draft.role) {
                        Text("Usuario").tag("user")
                        Text("Administrador").tag("admin")
                    }
                }
                Section(mode.isEditing ? "Cambiar contraseña" : "Contraseña") {
                    PasswordField(title: mode.isEditing ? "Dejar en blanco para no cambiarla" : "Contraseña",
                                 text: $model.draft.password,
                                 textContentType: .newPassword)
                }
            }
            .formStyle(.grouped)

            Divider()
            footer
        }
        .frame(width: 440, height: 380)
    }

    private var footer: some View {
        VStack(alignment: .leading, spacing: 8) {
            if let error = model.errorMessage {
                Label(error, systemImage: "exclamationmark.triangle")
                    .font(.callout)
                    .foregroundStyle(.red)
            }
            HStack {
                Spacer()
                Button("Cancelar", role: .cancel) { dismiss() }
                    .keyboardShortcut(.cancelAction)
                Button(action: save) {
                    if model.isSubmitting {
                        ProgressView().controlSize(.small)
                    } else {
                        Text(model.submitLabel)
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
        Task {
            if let user = await model.submit(settings: settings, session: session) {
                onSaved(user)
                dismiss()
            }
        }
    }
}
