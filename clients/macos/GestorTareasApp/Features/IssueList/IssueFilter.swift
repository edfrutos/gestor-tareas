import Foundation

/// Filtros de la lista de tareas. Solo incluye parámetros que acepta
/// `getIssuesSchema` del backend (ver `docs/API.md §3.1` y
/// `src/schemas/issue.schema.js`).
struct IssueFilter: Equatable {
    var query: String = ""
    var status: IssueStatus?
    var category: String?
    var order: Order = .new
    var scope: Scope = .all

    // Filtros avanzados (Hito 2)
    var mapID: Int?
    var assignedTo: Int?
    var fromDate: Date?
    var toDate: Date?

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

    /// `true` si hay algún filtro avanzado activo (para señalizarlo en la barra).
    var hasAdvancedFilters: Bool {
        mapID != nil || assignedTo != nil || fromDate != nil || toDate != nil
    }

    mutating func clearAdvancedFilters() {
        mapID = nil
        assignedTo = nil
        fromDate = nil
        toDate = nil
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
        if let mapID {
            items.append(URLQueryItem(name: "mapId", value: String(mapID)))
        }
        if let assignedTo {
            items.append(URLQueryItem(name: "assigned_to", value: String(assignedTo)))
        }
        if let fromDate {
            items.append(URLQueryItem(name: "from", value: AppDate.iso8601Day(fromDate)))
        }
        if let toDate {
            items.append(URLQueryItem(name: "to", value: AppDate.iso8601Day(toDate)))
        }
        return items
    }
}
