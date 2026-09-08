import SwiftUI

struct LoginView: View {
    @Environment(SessionStore.self) private var session
    @Environment(AppSettings.self) private var settings

    @State private var model = LoginViewModel()
    @State private var username = ""
    @State private var password = ""

    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: "mappin.and.ellipse")
                .font(.system(size: 44))
                .foregroundStyle(.tint)

            Text("Gestor de Tareas")
                .font(.largeTitle.bold())

            Text(settings.serverURLString)
                .font(.footnote)
                .foregroundStyle(.secondary)

            VStack(spacing: 10) {
                TextField("Usuario o email", text: $username)
                    .textContentType(.username)
                SecureField("Contraseña", text: $password)
                    .textContentType(.password)
                    .onSubmit(attempt)
            }
            .textFieldStyle(.roundedBorder)

            if let notice = session.notice {
                Text(notice)
                    .font(.callout)
                    .foregroundStyle(.orange)
                    .multilineTextAlignment(.center)
            }
            if let error = model.errorMessage {
                Text(error)
                    .font(.callout)
                    .foregroundStyle(.red)
                    .multilineTextAlignment(.center)
            }

            Button(action: attempt) {
                if model.isLoading {
                    ProgressView().controlSize(.small)
                } else {
                    Text("Entrar").frame(maxWidth: .infinity)
                }
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .keyboardShortcut(.defaultAction)
            .disabled(model.isLoading || username.isEmpty || password.isEmpty)

            Divider().padding(.vertical, 4)

            SettingsLink {
                Text("Configurar servidor…")
            }
        }
        .padding(40)
        .frame(width: 400)
    }

    private func attempt() {
        Task {
            await model.login(username: username,
                              password: password,
                              settings: settings,
                              session: session)
        }
    }
}
