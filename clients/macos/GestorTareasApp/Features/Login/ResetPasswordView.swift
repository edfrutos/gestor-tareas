import SwiftUI

/// Paso 2 de la recuperación de contraseña: el usuario pega el enlace o el
/// código del email (`ResetTokenParsing`) y elige una contraseña nueva.
struct ResetPasswordView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(SessionStore.self) private var session
    @Environment(AppSettings.self) private var settings

    @State private var model = ResetPasswordViewModel()
    @State private var pastedToken = ""
    @State private var newPassword = ""
    @State private var confirmPassword = ""

    var body: some View {
        VStack(spacing: 16) {
            Text("Elegir nueva contraseña").font(.title2.bold())

            if model.didSucceed {
                Label("Contraseña actualizada.", systemImage: "checkmark.circle.fill")
                    .foregroundStyle(.green)
                Text("Ya puedes iniciar sesión con tu nueva contraseña.")
                    .font(.callout)
                    .foregroundStyle(.secondary)
                Button("Cerrar") { dismiss() }
                    .keyboardShortcut(.defaultAction)
            } else {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Enlace o código del email").font(.caption).foregroundStyle(.secondary)
                    TextField("Pega aquí el enlace completo o solo el código", text: $pastedToken)
                        .textFieldStyle(.roundedBorder)
                }
                SecureField("Contraseña nueva", text: $newPassword)
                    .textFieldStyle(.roundedBorder)
                    .textContentType(.newPassword)
                SecureField("Repite la contraseña", text: $confirmPassword)
                    .textFieldStyle(.roundedBorder)
                    .textContentType(.newPassword)
                    .onSubmit(submit)

                if let error = model.errorMessage {
                    Text(error).font(.callout).foregroundStyle(.red).multilineTextAlignment(.center)
                }

                HStack {
                    Button("Cancelar", role: .cancel) { dismiss() }
                    Spacer()
                    Button(action: submit) {
                        if model.isLoading {
                            ProgressView().controlSize(.small)
                        } else {
                            Text("Guardar contraseña")
                        }
                    }
                    .buttonStyle(.borderedProminent)
                    .keyboardShortcut(.defaultAction)
                    .disabled(model.isLoading || pastedToken.isEmpty
                              || newPassword.isEmpty || confirmPassword.isEmpty)
                }
            }
        }
        .padding(28)
        .frame(width: 420)
    }

    private func submit() {
        Task {
            await model.submit(pastedToken: pastedToken,
                               newPassword: newPassword,
                               confirmPassword: confirmPassword,
                               settings: settings,
                               session: session)
        }
    }
}
