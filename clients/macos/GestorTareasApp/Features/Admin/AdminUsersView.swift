import SwiftUI

struct AdminUsersView: View {
    @Environment(SessionStore.self) private var session
    @Environment(AppSettings.self) private var settings
    @State private var model = AdminUsersViewModel()
    @State private var showCreate = false
    @State private var editingUser: AdminUser?
    @State private var pendingDelete: AdminUser?

    var body: some View {
        VStack(spacing: 0) {
            content
        }
        .toolbar {
            ToolbarItemGroup {
                Button { showCreate = true } label: {
                    Label("Nuevo usuario", systemImage: "person.badge.plus")
                }
                Button(action: reload) {
                    Label("Recargar", systemImage: "arrow.clockwise")
                }
                .disabled(model.isLoading)
            }
        }
        .sheet(isPresented: $showCreate) {
            AdminUserEditorView(mode: .create) { model.apply($0) }
                .environment(session)
                .environment(settings)
        }
        .sheet(item: $editingUser) { user in
            AdminUserEditorView(mode: .edit(user)) { model.apply($0) }
                .environment(session)
                .environment(settings)
        }
        .alert("¿Borrar a \(pendingDelete?.username ?? "")?",
               isPresented: Binding(get: { pendingDelete != nil }, set: { if !$0 { pendingDelete = nil } })) {
            Button("Cancelar", role: .cancel) {}
            Button("Borrar", role: .destructive) { confirmDelete() }
        } message: {
            Text("Esta acción no se puede deshacer.")
        }
        .task { await model.firstLoad(settings: settings, session: session) }
    }

    @ViewBuilder
    private var content: some View {
        if model.isLoading && model.users.isEmpty {
            VStack { Spacer(); ProgressView().controlSize(.large); Spacer() }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if let error = model.errorMessage, model.users.isEmpty {
            ContentUnavailableView {
                Label("No se pudieron cargar los usuarios", systemImage: "person.crop.circle.badge.exclamationmark")
            } description: {
                Text(error)
            } actions: {
                Button("Reintentar", action: reload)
            }
        } else {
            List {
                if let error = model.errorMessage {
                    Text(error).font(.caption).foregroundStyle(.red)
                }
                ForEach(model.users) { user in
                    row(for: user)
                        .task {
                            await model.loadMoreIfNeeded(current: user, settings: settings, session: session)
                        }
                }
                if model.isLoadingMore {
                    HStack { Spacer(); ProgressView(); Spacer() }
                }
            }
        }
    }

    private func row(for user: AdminUser) -> some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Text(user.username).font(.callout.weight(.medium))
                    if user.isAdmin {
                        Text("Admin")
                            .font(.caption2.weight(.semibold))
                            .padding(.horizontal, 6).padding(.vertical, 1)
                            .background(Color.accentColor.opacity(0.18), in: Capsule())
                            .foregroundStyle(Color.accentColor)
                    }
                }
                Text(user.email?.isEmpty == false ? user.email! : "Sin email")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            Button("Editar") { editingUser = user }
                .buttonStyle(.link)
            let isSelf = session.currentUser?.id == user.id
            Button("Borrar", role: .destructive) { pendingDelete = user }
                .buttonStyle(.link)
                .disabled(isSelf)
                .help(isSelf ? "No puedes borrar tu propio usuario." : "")
        }
        .padding(.vertical, 3)
    }

    private func reload() {
        Task { await model.reload(settings: settings, session: session) }
    }

    private func confirmDelete() {
        guard let user = pendingDelete else { return }
        pendingDelete = nil
        Task { _ = await model.delete(user, settings: settings, session: session) }
    }
}
