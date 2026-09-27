import SwiftUI

/// Formulario de contacto con soporte (`POST /v1/contact`). Se abre como
/// sheet desde el login (sin sesión) y desde el menú de cuenta (con sesión).
struct ContactView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(SessionStore.self) private var session
    @Environment(AppSettings.self) private var settings

    @State private var model: ContactViewModel

    init(user: SessionUser?) {
        _model = State(wrappedValue: ContactViewModel(user: user))
    }

    var body: some View {
        @Bindable var model = model

        VStack(spacing: 16) {
            Text("Contactar con soporte").font(.title2.bold())

            if model.didSend {
                Label("Mensaje enviado. Te responderemos por email.",
                      systemImage: "checkmark.circle")
                    .multilineTextAlignment(.center)
                Button("Cerrar") { dismiss() }
                    .keyboardShortcut(.defaultAction)
            } else {
                Text("Cuéntanos el problema o la sugerencia. Te responderemos al email que indiques.")
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)

                Form {
                    TextField("Nombre", text: $model.name)
                        .textContentType(.name)
                    TextField("Email de respuesta", text: $model.email)
                        .textContentType(.emailAddress)
                    TextField("Asunto", text: $model.subject)
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Mensaje").font(.callout).foregroundStyle(.secondary)
                        TextEditor(text: $model.message)
                            .font(.body)
                            .frame(minHeight: 140)
                            .scrollContentBackground(.hidden)
                            .padding(4)
                            .background(.background, in: RoundedRectangle(cornerRadius: 6))
                            .overlay(RoundedRectangle(cornerRadius: 6).stroke(.quaternary))
                    }
                }
                .formStyle(.columns)

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
                            Text("Enviar mensaje")
                        }
                    }
                    .buttonStyle(.borderedProminent)
                    .keyboardShortcut(.defaultAction)
                    .disabled(!model.canSubmit)
                }
            }
        }
        .padding(28)
        .frame(width: 460)
    }

    private func submit() {
        Task { await model.submit(settings: settings, session: session) }
    }
}
