import SwiftUI

struct IssueFilterBar: View {
    @Binding var filter: IssueFilter
    let categories: [String]
    var onCommit: () -> Void

    var body: some View {
        HStack(spacing: 10) {
            TextField("Buscar título, descripción o autor…", text: $filter.query)
                .textFieldStyle(.roundedBorder)
                .frame(maxWidth: 260)
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

            Spacer()
        }
        .padding(8)
    }
}
