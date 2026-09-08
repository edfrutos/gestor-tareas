import SwiftUI

struct PreferencesView: View {
    @Environment(AppSettings.self) private var settings

    var body: some View {
        @Bindable var settings = settings

        Form {
            Section("Servidor") {
                TextField("URL base",
                          text: $settings.serverURLString,
                          prompt: Text(AppSettings.fallbackURLString))
                    .textFieldStyle(.roundedBorder)

                if settings.baseURL == nil {
                    Label("La URL debe empezar por http:// o https://", systemImage: "exclamationmark.triangle")
                        .font(.footnote)
                        .foregroundStyle(.red)
                }

                Text("Ejemplos: https://localhost:8443 (Caddy) · http://localhost:3000 (local) · http://localhost:3001 (Docker)")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
        .formStyle(.grouped)
        .frame(width: 480)
        .padding(20)
    }
}
