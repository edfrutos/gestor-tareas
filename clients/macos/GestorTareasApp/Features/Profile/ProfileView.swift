import SwiftUI
import UniformTypeIdentifiers

/// "Mi perfil": el propio usuario cambia su email/contraseña y su foto.
/// Distinto de `AdminUserEditorView`, que es para que un admin edite a OTROS
/// usuarios.
struct ProfileView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(SessionStore.self) private var session
    @Environment(AppSettings.self) private var settings
    @State private var model: ProfileViewModel
    @State private var isImportingAvatar = false
    @State private var showDeleteConfirm = false
    @State private var showFinalDeleteAlert = false

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
                Section("Foto de perfil") {
                    avatarRow
                    if let error = model.avatarError {
                        Label(error, systemImage: "exclamationmark.triangle")
                            .font(.caption)
                            .foregroundStyle(.red)
                    }
                }
                Section("Cuenta") {
                    if let username = session.currentUser?.username {
                        LabeledContent("Usuario", value: username)
                    }
                    TextField("Email", text: $model.email)
                        .textContentType(.emailAddress)
                }
                Section("Cambiar contraseña") {
                    PasswordField(title: "Contraseña actual",
                                 text: $model.currentPassword,
                                 textContentType: .password)
                    PasswordField(title: "Nueva contraseña (dejar en blanco para no cambiarla)",
                                 text: $model.newPassword,
                                 textContentType: .newPassword)
                }
                Section("Zona de peligro") {
                    dangerZone
                }
            }
            .formStyle(.grouped)

            Divider()
            footer
        }
        .frame(width: 440, height: 460)
        .fileImporter(isPresented: $isImportingAvatar,
                      allowedContentTypes: [.jpeg, .png, .gif, .webP],
                      allowsMultipleSelection: false) { result in
            handleAvatarPick(result)
        }
        .onChange(of: model.didDeleteAccount) { _, deleted in
            if deleted { dismiss() }
        }
        .alert("¿Eliminar tu cuenta?",
               isPresented: $showFinalDeleteAlert) {
            Button("Cancelar", role: .cancel) {}
            Button("Eliminar cuenta", role: .destructive) {
                Task { await model.deleteAccount(settings: settings, session: session) }
            }
        } message: {
            Text("Esta acción no se puede deshacer.")
        }
    }

    /// Borrado de cuenta self-service (requerido por Apple Guideline
    /// 5.1.1(v)): distinto del borrado de OTROS usuarios que hace un admin
    /// desde `AdminUsersViewModel`.
    @ViewBuilder
    private var dangerZone: some View {
        if !showDeleteConfirm {
            Button("Eliminar mi cuenta…", role: .destructive) {
                showDeleteConfirm = true
            }
        } else {
            VStack(alignment: .leading, spacing: 8) {
                Text("Esta acción es irreversible: se borrarán tu perfil, tus comentarios y tus tokens de recuperación. Introduce tu contraseña para confirmar.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                PasswordField(title: "Contraseña",
                             text: $model.deleteAccountPassword,
                             textContentType: .password)
                if let error = model.deleteAccountError {
                    Label(error, systemImage: "exclamationmark.triangle")
                        .font(.caption)
                        .foregroundStyle(.red)
                }
                HStack {
                    Button("Cancelar") {
                        showDeleteConfirm = false
                        model.deleteAccountPassword = ""
                        model.deleteAccountError = nil
                    }
                    Spacer()
                    Button(role: .destructive) {
                        showFinalDeleteAlert = true
                    } label: {
                        if model.isDeletingAccount {
                            ProgressView().controlSize(.small)
                        } else {
                            Text("Confirmar borrado")
                        }
                    }
                    .disabled(model.isDeletingAccount || model.deleteAccountPassword.isEmpty)
                }
            }
        }
    }

    private var avatarRow: some View {
        HStack(spacing: 14) {
            avatarThumbnail
                .frame(width: 56, height: 56)
                .clipShape(Circle())
                .overlay {
                    if model.isUploadingAvatar {
                        ZStack {
                            Circle().fill(Color.black.opacity(0.35))
                            ProgressView().controlSize(.small).tint(.white)
                        }
                    }
                }

            VStack(alignment: .leading, spacing: 6) {
                Button(model.avatarThumbURL == nil ? "Elegir foto…" : "Cambiar foto…") {
                    isImportingAvatar = true
                }
                .disabled(model.isUploadingAvatar)
                if model.avatarThumbURL != nil {
                    Button("Quitar foto", role: .destructive) {
                        Task { await model.removeAvatar(settings: settings, session: session) }
                    }
                    .disabled(model.isUploadingAvatar)
                }
            }
        }
    }

    @ViewBuilder
    private var avatarThumbnail: some View {
        if let url = settings.mediaURL(model.avatarThumbURL) {
            AsyncImage(url: url) { phase in
                switch phase {
                case .success(let image):
                    image.resizable().scaledToFill()
                default:
                    placeholderAvatar
                }
            }
        } else {
            placeholderAvatar
        }
    }

    private var placeholderAvatar: some View {
        Image(systemName: "person.crop.circle.fill")
            .resizable()
            .foregroundStyle(.secondary)
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

    private func handleAvatarPick(_ result: Result<[URL], Error>) {
        guard case let .success(urls) = result, let url = urls.first else { return }
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        do {
            let data = try Data(contentsOf: url)
            let attachment = Attachment(filename: url.lastPathComponent, data: data)
            Task { await model.uploadAvatar(attachment, settings: settings, session: session) }
        } catch {
            model.avatarError = "No se pudo leer el archivo: \(error.localizedDescription)"
        }
    }
}
