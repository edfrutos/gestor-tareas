import Foundation

enum AdminUserEditorMode: Equatable {
    case create
    case edit(AdminUser)

    var isEditing: Bool { if case .edit = self { return true } else { return false } }

    var editingUser: AdminUser? {
        if case let .edit(user) = self { return user }
        return nil
    }
}

/// Estado editable del formulario de usuario (`Features/Admin`). El backend no
/// permite cambiar `username` tras crear la cuenta (`PATCH /v1/users/:id` solo
/// admite `role`, `email`, `password` — ver `src/routes/users.routes.js`).
struct AdminUserDraft: Equatable {
    var username = ""
    var email = ""
    var password = ""
    var role = "user"

    static func forEditing(_ user: AdminUser) -> AdminUserDraft {
        var draft = AdminUserDraft()
        draft.username = user.username
        draft.email = user.email ?? ""
        draft.role = user.role
        return draft
    }
}
