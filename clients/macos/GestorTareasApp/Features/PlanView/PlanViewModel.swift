import AppKit
import ImageIO
import Observation

@MainActor
@Observable
final class PlanViewModel {
    var maps: [MapRef] = []
    var selectedMapID: Int?
    var mapDetail: MapDetail?
    var planImage: NSImage?
    var coordinateSpace = PlanCoordinateSpace(imageWidth: 1000, imageHeight: 1000)
    var zones: [MapZone] = []
    var issues: [Issue] = []
    /// Capas técnicas activas (todas al cargar el plano; se pueden desmarcar).
    var visibleLayerIDs: Set<Int> = []

    /// Tarea a resaltar (se abrió desde "Ver en el plano" en el detalle).
    var highlightedIssueID: Int?

    var isLoadingMaps = false
    var isLoadingPlan = false
    var errorMessage: String?

    private static let issuesPageSize = 100

    // MARK: Selección de plano

    func loadMapList(settings: AppSettings, session: SessionStore) async {
        guard maps.isEmpty else { return }
        isLoadingMaps = true
        defer { isLoadingMaps = false }
        let api = GestorAPI(settings: settings, session: session)
        maps = ((try? await api.maps()) ?? []).filter { $0.parentID == nil }
    }

    func selectMap(_ id: Int, settings: AppSettings, session: SessionStore) async {
        selectedMapID = id
        isLoadingPlan = true
        errorMessage = nil
        planImage = nil
        defer { isLoadingPlan = false }

        let api = GestorAPI(settings: settings, session: session)
        do {
            async let detailRequest = api.mapDetail(id: id)
            async let zonesRequest = api.zones(mapID: id)
            async let issuesRequest = api.issues(
                filter: IssueFilter(mapID: id),
                page: 1,
                pageSize: Self.issuesPageSize
            )

            let detail = try await detailRequest
            mapDetail = detail
            visibleLayerIDs = Set(detail.layers.map(\.id))
            zones = (try? await zonesRequest) ?? []
            issues = (try? await issuesRequest)?.items ?? []

            guard let url = settings.mediaURL(detail.fileURL) else {
                errorMessage = "No se pudo resolver la URL del plano."
                return
            }
            let (image, pixelSize) = try await Self.loadImage(from: url)
            planImage = image
            coordinateSpace = PlanCoordinateSpace(imageSize: pixelSize)
        } catch let error as APIError {
            errorMessage = error.message
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func toggleLayer(_ id: Int) {
        if visibleLayerIDs.contains(id) {
            visibleLayerIDs.remove(id)
        } else {
            visibleLayerIDs.insert(id)
        }
    }

    // MARK: Tiempo real (Hito 3)

    func apply(_ event: IssueRealtimeEvent) {
        switch event {
        case let .created(issue):
            guard issue.mapID == selectedMapID else { return }
            guard !issues.contains(where: { $0.id == issue.id }) else { return }
            issues.insert(issue, at: 0)

        case let .updated(issue):
            if let index = issues.firstIndex(where: { $0.id == issue.id }) {
                if issue.mapID == selectedMapID {
                    issues[index] = issue
                } else {
                    issues.remove(at: index)   // se reasignó a otro plano
                }
            } else if issue.mapID == selectedMapID {
                issues.insert(issue, at: 0)
            }

        case let .deleted(id):
            issues.removeAll { $0.id == id }

        case .settingsUpdated:
            break
        }
    }

    // MARK: Carga de imagen (necesitamos el tamaño real en píxeles, no el de
    // `AsyncImage`, para reproducir `PlanCoordinateSpace` igual que la web)

    private static func loadImage(from url: URL) async throws -> (image: NSImage, pixelSize: CGSize) {
        let (data, response) = try await URLSession.shared.data(from: url)
        if let http = response as? HTTPURLResponse, !(200...299).contains(http.statusCode) {
            throw APIError.from(status: http.statusCode, data: data)
        }
        guard let image = NSImage(data: data) else {
            throw APIError.transport(message: "No se pudo decodificar la imagen del plano.")
        }
        guard let source = CGImageSourceCreateWithData(data as CFData, nil),
              let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
              let width = properties[kCGImagePropertyPixelWidth] as? NSNumber,
              let height = properties[kCGImagePropertyPixelHeight] as? NSNumber else {
            return (image, image.size)
        }
        return (image, CGSize(width: CGFloat(width.doubleValue), height: CGFloat(height.doubleValue)))
    }
}
