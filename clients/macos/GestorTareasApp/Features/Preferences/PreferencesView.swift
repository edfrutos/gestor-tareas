import AppKit
import SwiftUI

struct PreferencesView: View {
    @Environment(AppSettings.self) private var settings
    @Environment(UpdateChecker.self) private var updateChecker

    var body: some View {
        @Bindable var settings = settings

        Form {
            Section("Actualizaciones") {
                let running = UpdateChecker.runningVersion
                Text("Versión instalada: \(running.version) (build \(running.build))")
                    .font(.footnote)
                    .foregroundStyle(.secondary)

                if updateChecker.hasUpdate, let release = updateChecker.latestRelease {
                    Label("Hay una versión nueva: \(release.displayName)", systemImage: "arrow.down.circle.fill")
                        .foregroundStyle(Theme.accent)
                    #if !MAS_BUILD
                    if let dmgURL = release.dmgURL {
                        Button("Descargar…") { NSWorkspace.shared.open(dmgURL) }
                    }
                    #endif
                } else if let error = updateChecker.lastError {
                    Label(error, systemImage: "exclamationmark.triangle")
                        .font(.footnote)
                        .foregroundStyle(.red)
                } else if !updateChecker.isChecking {
                    Text("No hay actualizaciones pendientes.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }

                Button(updateChecker.isChecking ? "Comprobando…" : "Buscar actualizaciones ahora") {
                    Task { await updateChecker.check() }
                }
                .disabled(updateChecker.isChecking)
            }

            Section("Apariencia") {
                Picker("Tema", selection: $settings.appearanceMode) {
                    ForEach(AppearanceMode.allCases) { mode in
                        Text(mode.label).tag(mode)
                    }
                }
                .pickerStyle(.segmented)
            }

            #if DEBUG
            // Solo en builds de desarrollo: en Release el servidor es fijo
            // (gtareas.edefrutos2020.com, ver AppSettings.fallbackURLString)
            // y no tiene sentido dejar que el usuario final lo cambie.
            Section("Servidor (solo Debug)") {
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
            #endif
        }
        .formStyle(.grouped)
        .frame(width: 480)
        .padding(20)
    }
}
