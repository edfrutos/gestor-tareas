import SwiftUI

struct IssueFilterBar: View {
    @Binding var filter: IssueFilter
    let categories: [String]
    let assignees: [UserRef]
    let maps: [MapRef]
    var onCommit: () -> Void

    @State private var showAdvanced = false

    var body: some View {
        HStack(spacing: 10) {
            TextField("Buscar título, descripción o autor…", text: $filter.query)
                .textFieldStyle(.roundedBorder)
                .frame(maxWidth: 240)
                .onSubmit(onCommit)

            Picker("Estado", selection: $filter.status) {
                Text("Todos").tag(IssueStatus?.none)
                ForEach(IssueStatus.allCases) { status in
                    Text(status.label).tag(Optional(status))
                }
            }
            .fixedSize()
            .onChange(of: filter.status) { onCommit() }

            Picker("Categoría", selection: $filter.category) {
                Text("Todas").tag(String?.none)
                ForEach(categories, id: \.self) { category in
                    Text(category).tag(Optional(category))
                }
            }
            .fixedSize()
            .onChange(of: filter.category) { onCommit() }

            Picker("Orden", selection: $filter.order) {
                ForEach(IssueFilter.Order.allCases) { order in
                    Text(order.label).tag(order)
                }
            }
            .fixedSize()
            .onChange(of: filter.order) { onCommit() }

            Picker("Ámbito", selection: $filter.scope) {
                ForEach(IssueFilter.Scope.allCases) { scope in
                    Text(scope.label).tag(scope)
                }
            }
            .fixedSize()
            .onChange(of: filter.scope) { onCommit() }

            Button {
                showAdvanced.toggle()
            } label: {
                Label("Más filtros", systemImage: filter.hasAdvancedFilters
                      ? "line.3.horizontal.decrease.circle.fill"
                      : "line.3.horizontal.decrease.circle")
            }
            .popover(isPresented: $showAdvanced, arrowEdge: .bottom) {
                advancedFilters
            }

            Spacer()
        }
        .padding(8)
    }

    // MARK: Filtros avanzados (Hito 2)

    private var advancedFilters: some View {
        Form {
            Section("Rango de fechas de creación") {
                dateRow("Desde", date: $filter.fromDate)
                dateRow("Hasta", date: $filter.toDate)
            }

            Section("Asignación y plano") {
                Picker("Asignada a", selection: $filter.assignedTo) {
                    Text("Cualquiera").tag(Int?.none)
                    ForEach(assignees) { user in
                        Text(user.username).tag(Optional(user.id))
                    }
                }

                if maps.isEmpty {
                    Toggle("Filtrar por plano", isOn: Binding(
                        get: { filter.mapID != nil },
                        set: { filter.mapID = $0 ? (filter.mapID ?? 1) : nil }
                    ))
                    if filter.mapID != nil {
                        Stepper("Plano #\(filter.mapID ?? 1)", value: Binding(
                            get: { filter.mapID ?? 1 },
                            set: { filter.mapID = $0 }
                        ), in: 1...9_999)
                    }
                } else {
                    Picker("Plano", selection: $filter.mapID) {
                        Text("Cualquiera").tag(Int?.none)
                        ForEach(maps) { map in
                            Text(map.name).tag(Optional(map.id))
                        }
                    }
                }
            }

            if filter.hasAdvancedFilters {
                Button("Limpiar filtros avanzados", role: .destructive) {
                    filter.clearAdvancedFilters()
                }
            }
        }
        .formStyle(.grouped)
        .frame(width: 340, height: 320)
        .onChange(of: advancedFingerprint) { onCommit() }
    }

    @ViewBuilder
    private func dateRow(_ label: String, date: Binding<Date?>) -> some View {
        Toggle(label, isOn: Binding(
            get: { date.wrappedValue != nil },
            set: { date.wrappedValue = $0 ? (date.wrappedValue ?? Date()) : nil }
        ))
        if date.wrappedValue != nil {
            DatePicker("", selection: Binding(
                get: { date.wrappedValue ?? Date() },
                set: { date.wrappedValue = $0 }
            ), displayedComponents: .date)
            .labelsHidden()
        }
    }

    /// Cadena que cambia cuando cambia cualquier filtro avanzado; dispara `onCommit`.
    private var advancedFingerprint: String {
        let from = filter.fromDate.map(AppDate.iso8601Day) ?? "-"
        let to = filter.toDate.map(AppDate.iso8601Day) ?? "-"
        let assignee = filter.assignedTo.map { String($0) } ?? "-"
        let map = filter.mapID.map { String($0) } ?? "-"
        return "\(from)|\(to)|\(assignee)|\(map)"
    }
}
