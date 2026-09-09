import SwiftUI
import Charts

struct StatsView: View {
    @Environment(SessionStore.self) private var session
    @Environment(AppSettings.self) private var settings
    @State private var model = StatsViewModel()

    var body: some View {
        ScrollView {
            content
                .padding(24)
                .frame(maxWidth: 820, alignment: .leading)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .navigationTitle("Estadísticas")
        .toolbar {
            ToolbarItem {
                Button(action: load) {
                    Label("Recargar", systemImage: "arrow.clockwise")
                }
                .disabled(model.isLoading)
            }
        }
        .task { load() }
    }

    @ViewBuilder
    private var content: some View {
        if model.isLoading && model.stats.total == 0 {
            ProgressView().controlSize(.large)
        } else if let error = model.errorMessage {
            ContentUnavailableView {
                Label("No se pudieron cargar las estadísticas", systemImage: "chart.bar")
            } description: {
                Text(error)
            } actions: {
                Button("Reintentar", action: load)
            }
        } else {
            VStack(alignment: .leading, spacing: 28) {
                kpiRow
                statusChart
                categoryChart
                if session.isAdmin && !model.details.byUser.isEmpty {
                    userChart
                }
            }
        }
    }

    private var kpiRow: some View {
        HStack(spacing: 12) {
            kpi("Abiertas", model.stats.open, .blue)
            kpi("En proceso", model.stats.inProgress, .orange)
            kpi("Resueltas", model.stats.resolved, .green)
            kpi("Total", model.stats.total, .primary)
        }
    }

    private func kpi(_ title: String, _ value: Int, _ color: Color) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title).font(.caption).foregroundStyle(.secondary)
            Text("\(value)").font(.system(.largeTitle, design: .rounded).weight(.semibold))
                .foregroundStyle(color)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(.quaternary.opacity(0.4), in: RoundedRectangle(cornerRadius: 10))
    }

    @ViewBuilder
    private var statusChart: some View {
        let slices = model.statusSlices
        if !slices.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                Text("Por estado").font(.headline)
                Chart(slices) { slice in
                    SectorMark(
                        angle: .value("Tareas", slice.count),
                        innerRadius: .ratio(0.6),
                        angularInset: 1.5
                    )
                    .foregroundStyle(by: .value("Estado", slice.label))
                    .annotation(position: .overlay) {
                        Text("\(slice.count)").font(.caption).bold()
                    }
                }
                .chartForegroundStyleScale(
                    domain: ["Abiertas", "En proceso", "Resueltas"],
                    range: [Color.blue, Color.orange, Color.green]
                )
                .frame(height: 220)
            }
        }
    }

    @ViewBuilder
    private var categoryChart: some View {
        let categories = model.categoriesSorted
        if !categories.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                Text("Por categoría").font(.headline)
                Chart(categories) { item in
                    BarMark(
                        x: .value("Tareas", item.count),
                        y: .value("Categoría", item.label)
                    )
                    .foregroundStyle(Color.accentColor)
                    .annotation(position: .trailing) {
                        Text("\(item.count)").font(.caption).foregroundStyle(.secondary)
                    }
                }
                .frame(height: CGFloat(max(120, categories.count * 34)))
            }
        }
    }

    private var userChart: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Top usuarios (creadas)").font(.headline)
            Chart(model.details.byUser) { item in
                BarMark(
                    x: .value("Tareas", item.count),
                    y: .value("Usuario", item.username)
                )
                .foregroundStyle(Color.teal)
                .annotation(position: .trailing) {
                    Text("\(item.count)").font(.caption).foregroundStyle(.secondary)
                }
            }
            .frame(height: CGFloat(max(120, model.details.byUser.count * 34)))
        }
    }

    private func load() {
        Task { await model.load(settings: settings, session: session) }
    }
}
