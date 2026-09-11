import SwiftUI

/// Paso 1 de la recuperación de contraseña: pide el email y dispara
/// `POST /v1/auth/forgot-password`. El backend nunca dice si el email existe,
/// así que el mensaje de éxito es siempre el mismo.
struct ForgotPasswordView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(SessionStore.self) private var session
    @Environment(AppSettings.self) private var settings

    @State private var model = ForgotPasswordViewModel()
    @State private var email = ""

    var body: some View {
        VStack(spacing: 16) {
            Text("Recuperar contraseña").font(.title2.bold())

            if model.didSubmit {
                Label("Si ese email existe, recibirás instrucciones en breve.",
                      systemImage: "envelope.badge.checkmark")
                    .multilineTextAlignment(.center)
                Text("El enlace del email expira en 1 hora. Cuando lo tengas, usa "
                     + "«Ya tengo un código» en la pantalla de inicio de sesión.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                Button("Cerrar") { dismiss() }
                    .keyboardShortcut(.defaultAction)
            } else {
                Text("Escribe el email de tu cuenta y te enviaremos instrucciones para elegir una contraseña nueva.")
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)

                TextField("Email", text: $email)
                    .textFieldStyle(.roundedBorder)
                    .textContentType(.username)
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
                            Text("Enviar instrucciones")
                        }
                    }
                    .buttonStyle(.borderedProminent)
                    .keyboardShortcut(.defaultAction)
                    .disabled(model.isLoading || email.isEmpty)
                }
            }
        }
        .padding(28)
        .frame(width: 380)
    }

    private func submit() {
        Task { await model.submit(email: email, settings: settings, session: session) }
    }
}
