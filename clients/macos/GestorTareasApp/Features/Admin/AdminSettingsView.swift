import SwiftUI

struct AdminSettingsView: View {
    @Environment(SessionStore.self) private var session
    @Environment(AppSettings.self) private var settings
    @Environment(SocketClient.self) private var socket
    @State private var model = AdminSettingsViewModel()

    var body: some View {
        ScrollView {
            content
                .padding(24)
                .frame(maxWidth: 560, alignment: .leading)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .toolbar {
            ToolbarItem {
                Button(action: reload) {
                    Label("Recargar", systemImage: "arrow.clockwise")
                }
                .disabled(model.isLoading)
            }
        }
        .task { await model.load(settings: settings, session: session) }
        // Cierra lo que dejó pendiente el Hito 3: `settings:updated` ahora sí
        // hace algo (refresca desde el servidor si otro admin cambió algo).
        .task(id: socket.lastEvent?.id) {
            if case .settingsUpdated = socket.lastEvent?.payload {
                await model.load(settings: settings, session: session)
            }
        }
    }

    @ViewBuilder
    private var content: some View {
        @Bindable var model = model

        if model.isLoading && model.original == AppRuntimeSettings() {
            ProgressView().controlSize(.large)
        } else if let error = model.errorMessage, model.original == AppRuntimeSettings() {
            ContentUnavailableView {
                Label("No se pudo cargar la configuración", systemImage: "gearshape")
            } description: {
                Text(error)
            } actions: {
                Button("Reintentar", action: reload)
            }
        } else {
            VStack(alignment: .leading, spacing: 22) {
                Form {
                    Section("Subidas") {
                        LabeledContent("Tamaño máximo (bytes)") {
                            TextField("p. ej. 8388608", text: $model.maxUploadBytes)
                                .textFieldStyle(.roundedBorder)
                                .frame(width: 140)
                        }
                    }
                    Section("Límite de peticiones") {
                        Toggle("Activado", isOn: $model.rateLimitEnabled)
                        LabeledContent("Ventana (ms)") {
                            TextField("p. ej. 60000", text: $model.rateLimitWindowMs)
                                .textFieldStyle(.roundedBorder)
                                .frame(width: 140)
                        }
                        LabeledContent("Máximo de peticiones") {
                            TextField("p. ej. 100", text: $model.rateLimitMax)
                                .textFieldStyle(.roundedBorder)
                                .frame(width: 140)
                        }
                    }
                    Section("Servidor") {
                        TextField("Email del administrador", text: $model.adminEmail)
                            .textContentType(.email)
                        TextField("URL pública", text: $model.publicURL)
                        TextField("URL de Mailpit", text: $model.mailpitURL)
                    }
                }
                .formStyle(.grouped)
                .frame(minHeight: 420)

                if model.didSave {
                    Label("Guardado. Los clientes conectados se han actualizado en vivo.",
                          systemImage: "checkmark.circle.fill")
                        .foregroundStyle(.green)
                }
                if let error = model.errorMessage {
                    Label(error, systemImage: "exclamationmark.triangle")
                        .foregroundStyle(.red)
                }

                HStack {
                    Spacer()
                    Button(action: save) {
                        if model.isSaving {
                            ProgressView().controlSize(.small)
                        } else {
                            Text("Guardar cambios")
                        }
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(model.isSaving)
                }
            }
        }
    }

    private func reload() {
        Task { await model.load(settings: settings, session: session) }
    }

    private func save() {
        Task { await model.save(settings: settings, session: session) }
    }
}
