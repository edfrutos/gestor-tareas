import Foundation

/// Filtros de la lista de tareas. Solo incluye parámetros que acepta
/// `getIssuesSchema` del backend (ver `docs/API.md §3.1`).
struct IssueFilter: Equatable {
    var query: String = ""
    var status: IssueStatus?
    var category: String?
    var order: Order = .new
    var scope: Scope = .all

    enum Order: String, CaseIterable, Identifiable {
        case new, old, priority
        case dueDate = "due_date"
        case status
        case cat

        var id: String { rawValue }

        var label: String {
            switch self {
            case .new: return "Más recientes"
            case .old: return "Más antiguas"
            case .priority: return "Prioridad"
            case .dueDate: return "Fecha límite"
            case .status: return "Estado"
            case .cat: return "Categoría"
            }
        }
    }

    enum Scope: String, CaseIterable, Identifiable {
        case all, assignedToMe, createdByMe

        var id: String { rawValue }

        var label: String {
            switch self {
            case .all: return "Todas"
            case .assignedToMe: return "Asignadas a mí"
            case .createdByMe: return "Creadas por mí"
            }
        }
    }

    func queryItems(page: Int, pageSize: Int = 50) -> [URLQueryItem] {
        var items: [URLQueryItem] = [
            URLQueryItem(name: "page", value: String(page)),
            URLQueryItem(name: "pageSize", value: String(pageSize)),
            URLQueryItem(name: "order", value: order.rawValue),
        ]

        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmed.isEmpty {
            items.append(URLQueryItem(name: "q", value: trimmed))
        }
        if let status {
            items.append(URLQueryItem(name: "status", value: status.rawValue))
        }
        if let category, !category.isEmpty {
            items.append(URLQueryItem(name: "category", value: category))
        }
        switch scope {
        case .all:
            break
        case .assignedToMe:
            items.append(URLQueryItem(name: "only_assigned_to_me", value: "true"))
        case .createdByMe:
            items.append(URLQueryItem(name: "only_created_by_me", value: "true"))
        }
        return items
    }
}
