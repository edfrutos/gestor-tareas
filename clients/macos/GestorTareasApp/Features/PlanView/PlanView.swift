import AppKit
import SwiftUI

/// Visor del plano: imagen con zoom/pan, capas técnicas, zonas y chinchetas de
/// tareas coloreadas por estado/prioridad. Reacciona en vivo a `SocketClient`.
///
/// Se usa de dos formas:
/// - Como panel principal (`MainView`, pestaña "Plano"): sin `initialMapID`,
///   elige el primer plano disponible y dentro de una `NavigationStack` que ya
///   registra `navigationDestination(for: Int.self)`.
/// - Como hoja desde `IssueDetailView` ("Ver en el plano"): con `initialMapID`
///   y `highlightIssueID`; en ese caso el presentador debe envolverla en su
///   propia `NavigationStack` (una hoja no hereda la del padre).
struct PlanView: View {
    var initialMapID: Int?
    var highlightIssueID: Int?

    @Environment(SessionStore.self) private var session
    @Environment(AppSettings.self) private var settings
    @Environment(SocketClient.self) private var socket
    @State private var model = PlanViewModel()

    var body: some View {
        VStack(spacing: 0) {
            toolbarRow
            Divider()
            content
        }
        .background(Theme.panel)
        .clipShape(RoundedRectangle(cornerRadius: 14))
        .overlay(RoundedRectangle(cornerRadius: 14).stroke(Theme.cardBorder, lineWidth: 1))
        .padding(12)
        .navigationTitle("Plano")
        .task {
            model.highlightedIssueID = highlightIssueID
            await model.loadMapList(settings: settings, session: session)
            let target = initialMapID ?? model.maps.first?.id
            if let target {
                await model.selectMap(target, settings: settings, session: session)
            }
        }
        .task(id: socket.lastEvent?.id) {
            if let event = socket.lastEvent?.payload {
                model.apply(event)
            }
        }
    }

    private var toolbarRow: some View {
        HStack(spacing: 12) {
            if model.maps.count > 1 {
                Picker("Plano", selection: mapSelection) {
                    ForEach(model.maps) { map in
                        Text(map.name).tag(Optional(map.id))
                    }
                }
                .fixedSize()
            } else {
                Text(model.mapDetail?.name ?? "Plano").font(.headline)
            }

            if let detail = model.mapDetail, !detail.layers.isEmpty {
                Menu {
                    ForEach(detail.layers) { layer in
                        Toggle(layer.name, isOn: Binding(
                            get: { model.visibleLayerIDs.contains(layer.id) },
                            set: { _ in model.toggleLayer(layer.id) }
                        ))
                    }
                } label: {
                    Label("Capas", systemImage: "square.3.layers.3d")
                }
                .fixedSize()
            }

            if model.mapDetail != nil {
                Button {
                    model.isDrawingZone.toggle()
                } label: {
                    Label(model.isDrawingZone ? "Cancelar dibujo" : "Dibujar zona",
                          systemImage: model.isDrawingZone ? "xmark.circle" : "pencil")
                }
                .tint(model.isDrawingZone ? Theme.bad : Theme.accent)
                .help("Arrastra sobre el plano para crear una zona rectangular.")
                if model.isSavingZone {
                    ProgressView().controlSize(.small)
                }
            }

            Spacer()

            if model.isLoadingPlan {
                ProgressView().controlSize(.small)
            }
            Text("\(model.issues.count) tarea(s)")
                .font(.caption.weight(.semibold))
                .padding(.horizontal, 8)
                .padding(.vertical, 3)
                .background(Theme.chip, in: Capsule())
        }
        .padding(10)
    }

    private var mapSelection: Binding<Int?> {
        Binding(
            get: { model.selectedMapID },
            set: { newValue in
                guard let id = newValue, id != model.selectedMapID else { return }
                Task { await model.selectMap(id, settings: settings, session: session) }
            }
        )
    }

    @ViewBuilder
    private var content: some View {
        if model.isLoadingMaps && model.maps.isEmpty {
            VStack { Spacer(); ProgressView().controlSize(.large); Spacer() }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if model.maps.isEmpty {
            ContentUnavailableView("Sin planos",
                                   systemImage: "map",
                                   description: Text("Todavía no hay ningún plano disponible."))
        } else if let error = model.errorMessage, model.planImage == nil {
            ContentUnavailableView {
                Label("No se pudo cargar el plano", systemImage: "exclamationmark.triangle")
            } description: {
                Text(error)
            }
        } else if model.isLoadingPlan && model.planImage == nil {
            VStack { Spacer(); ProgressView().controlSize(.large); Spacer() }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if let image = model.planImage {
            PlanCanvas(model: model, image: image)
        } else {
            ContentUnavailableView("Elige un plano", systemImage: "map")
        }
    }
}

// MARK: - Lienzo con zoom/pan + capas + zonas + chinchetas

private struct PlanCanvas: View {
    let model: PlanViewModel
    let image: NSImage

    @Environment(AppSettings.self) private var settings
    @Environment(SessionStore.self) private var session
    @State private var scale: CGFloat = 1
    @State private var gestureScale: CGFloat = 1

    // MARK: Dibujar zona (rectángulo)
    @State private var drawStartFraction: CGPoint?
    @State private var drawCurrentFraction: CGPoint?
    @State private var pendingZoneFractions: (start: CGPoint, end: CGPoint)?
    @State private var showZoneNamePrompt = false
    @State private var zoneNameInput = ""

    private var effectiveScale: CGFloat { scale * gestureScale }

    var body: some View {
        GeometryReader { proxy in
            let base = Self.aspectFitSize(imageSize: image.size, in: proxy.size)
            let displaySize = CGSize(width: base.width * effectiveScale,
                                     height: base.height * effectiveScale)

            ScrollView([.horizontal, .vertical]) {
                ZStack(alignment: .topLeading) {
                    Image(nsImage: image)
                        .resizable()
                        .frame(width: displaySize.width, height: displaySize.height)
                    layersOverlay
                    zonesOverlay
                    pinsOverlay(size: displaySize)
                    drawPreview(size: displaySize)
                }
                .frame(width: displaySize.width, height: displaySize.height)
                .contentShape(Rectangle())
                .gesture(
                    DragGesture(minimumDistance: 4, coordinateSpace: .local)
                        .onChanged { value in
                            guard model.isDrawingZone else { return }
                            if drawStartFraction == nil {
                                drawStartFraction = fraction(for: value.startLocation, in: displaySize)
                            }
                            drawCurrentFraction = fraction(for: value.location, in: displaySize)
                        }
                        .onEnded { value in
                            guard model.isDrawingZone else { return }
                            let end = fraction(for: value.location, in: displaySize)
                            if let start = drawStartFraction {
                                pendingZoneFractions = (start, end)
                                zoneNameInput = "Nueva zona"
                                showZoneNamePrompt = true
                            }
                            drawStartFraction = nil
                            drawCurrentFraction = nil
                        }
                )
            }
            .simultaneousGesture(
                MagnificationGesture()
                    .onChanged { gestureScale = $0 }
                    .onEnded { value in
                        scale = min(max(scale * value, 0.5), 6)
                        gestureScale = 1
                    }
            )
        }
        .overlay(alignment: .bottomTrailing) { zoomControls }
        .alert("Nombre de la zona", isPresented: $showZoneNamePrompt) {
            TextField("Nombre", text: $zoneNameInput)
            Button("Cancelar", role: .cancel) { pendingZoneFractions = nil }
            Button("Crear") { confirmZoneCreate() }
        } message: {
            Text("Se guarda en este plano, visible para cualquiera que lo consulte.")
        }
        .alert("No se pudo guardar la zona", isPresented: Binding(
            get: { model.zoneError != nil },
            set: { if !$0 { model.zoneError = nil } }
        )) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(model.zoneError ?? "")
        }
    }

    private func fraction(for point: CGPoint, in size: CGSize) -> CGPoint {
        guard size.width > 0, size.height > 0 else { return .zero }
        return CGPoint(x: min(max(point.x / size.width, 0), 1),
                       y: min(max(point.y / size.height, 0), 1))
    }

    private func confirmZoneCreate() {
        guard let pending = pendingZoneFractions else { return }
        let name = zoneNameInput.trimmingCharacters(in: .whitespacesAndNewlines)
        Task {
            await model.createRectangleZone(name: name.isEmpty ? "Nueva zona" : name,
                                            fractionStart: pending.start,
                                            fractionEnd: pending.end,
                                            settings: settings,
                                            session: session)
            pendingZoneFractions = nil
        }
    }

    @ViewBuilder
    private func drawPreview(size: CGSize) -> some View {
        if let start = drawStartFraction, let current = drawCurrentFraction {
            let x0 = min(start.x, current.x) * size.width
            let x1 = max(start.x, current.x) * size.width
            let y0 = min(start.y, current.y) * size.height
            let y1 = max(start.y, current.y) * size.height
            Rectangle()
                .fill(Theme.accent.opacity(0.2))
                .overlay(Rectangle().stroke(Theme.accent, lineWidth: 2))
                .frame(width: x1 - x0, height: y1 - y0)
                .position(x: (x0 + x1) / 2, y: (y0 + y1) / 2)
                .allowsHitTesting(false)
        }
    }

    private var zoomControls: some View {
        HStack(spacing: 6) {
            Button { withAnimation { scale = max(0.5, scale - 0.25) } } label: {
                Image(systemName: "minus.magnifyingglass")
            }
            Button("Ajustar") { withAnimation { scale = 1 } }
            Button { withAnimation { scale = min(6, scale + 0.25) } } label: {
                Image(systemName: "plus.magnifyingglass")
            }
        }
        .buttonStyle(.bordered)
        .controlSize(.small)
        .padding(8)
        .background(Theme.panel, in: RoundedRectangle(cornerRadius: 10))
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(Theme.cardBorder, lineWidth: 1))
        .padding(14)
    }

    /// Capas técnicas: otras imágenes superpuestas a la misma escala que el
    /// plano principal, opacidad fija 0.7 (igual que la SPA web).
    @ViewBuilder
    private var layersOverlay: some View {
        if let detail = model.mapDetail {
            ForEach(detail.layers) { layer in
                if model.visibleLayerIDs.contains(layer.id),
                   let url = settings.mediaURL(layer.fileURL) {
                    AsyncImage(url: url) { phase in
                        if case let .success(layerImage) = phase {
                            layerImage.resizable().opacity(0.7)
                        }
                    }
                    .allowsHitTesting(false)
                }
            }
        }
    }

    /// Zonas dibujadas sobre el plano. Solo el anillo exterior del polígono
    /// (sin agujeros) — suficiente para las formas que produce Leaflet.draw
    /// (rectángulo / polígono simple) en la web.
    @ViewBuilder
    private var zonesOverlay: some View {
        ForEach(model.zones) { zone in
            let rings = zone.polygonRings(in: model.coordinateSpace)
            if let exterior = rings.first, exterior.count >= 3 {
                ZonePolygon(points: exterior)
                    .fill(zone.displayColor.opacity(0.22))
                    .overlay(ZonePolygon(points: exterior).stroke(zone.displayColor, lineWidth: 2))
                    .help(zone.name)
                    .contentShape(ZonePolygon(points: exterior))
                    .contextMenu {
                        Text(zone.name)
                        Button("Eliminar zona", role: .destructive) {
                            Task { await model.deleteZone(zone, settings: settings, session: session) }
                        }
                    }
            }
        }
    }

    private func pinsOverlay(size: CGSize) -> some View {
        ForEach(model.issues) { issue in
            pin(for: issue, size: size)
        }
    }

    @ViewBuilder
    private func pin(for issue: Issue, size: CGSize) -> some View {
        if let lat = issue.lat, let lng = issue.lng {
            let fraction = model.coordinateSpace.fraction(lat: lat, lng: lng)
            NavigationLink(value: issue.id) {
                IssuePin(issue: issue, isHighlighted: issue.id == model.highlightedIssueID)
            }
            .buttonStyle(.plain)
            .position(x: fraction.x * size.width, y: fraction.y * size.height)
        }
    }

    private static func aspectFitSize(imageSize: CGSize, in bounds: CGSize) -> CGSize {
        guard imageSize.width > 0, imageSize.height > 0,
              bounds.width > 0, bounds.height > 0 else { return bounds }
        let scale = min(bounds.width / imageSize.width, bounds.height / imageSize.height)
        return CGSize(width: imageSize.width * scale, height: imageSize.height * scale)
    }
}

/// Polígono a partir de puntos fraccionales `(0...1, 0...1)`, escalados al
/// rectángulo que SwiftUI le asigne a la forma.
private struct ZonePolygon: Shape {
    let points: [CGPoint]

    func path(in rect: CGRect) -> Path {
        var path = Path()
        guard let first = points.first else { return path }
        path.move(to: CGPoint(x: first.x * rect.width, y: first.y * rect.height))
        for point in points.dropFirst() {
            path.addLine(to: CGPoint(x: point.x * rect.width, y: point.y * rect.height))
        }
        path.closeSubpath()
        return path
    }
}

private struct IssuePin: View {
    let issue: Issue
    let isHighlighted: Bool

    var body: some View {
        ZStack {
            if isHighlighted {
                Circle()
                    .stroke(Color.accentColor, lineWidth: 3)
                    .frame(width: 28, height: 28)
            }
            Circle()
                .fill(issue.status.color)
                .frame(width: 14, height: 14)
                .overlay(Circle().stroke(issue.priority.color, lineWidth: 2))
        }
        .help("\(issue.title) · \(issue.status.label) · \(issue.priority.label)")
    }
}
