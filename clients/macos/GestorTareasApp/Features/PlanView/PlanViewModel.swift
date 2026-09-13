import AppKit
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

    /// Modo "dibujar zona" (rectángulo) activo en `PlanCanvas`.
    var isDrawingZone = false
    var isSavingZone = false
    var zoneError: String?

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
            let (image, pixelSize) = try await RemoteImage.load(from: url)
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

    // MARK: Zonas (dibujar/borrar)

    /// Crea una zona rectangular a partir de dos esquinas en fracción `(0...1,
    /// 0...1)` del plano (`PlanCanvas` las da en su propio espacio de pantalla).
    /// Solo el admin o el dueño del plano puede hacerlo — el backend lo exige,
    /// aquí solo se traduce el 403 a un mensaje legible.
    func createRectangleZone(name: String,
                             fractionStart: CGPoint,
                             fractionEnd: CGPoint,
                             settings: AppSettings,
                             session: SessionStore) async {
        guard let mapID = selectedMapID else { return }
        zoneError = nil
        isSavingZone = true
        defer { isSavingZone = false }

        let corner1 = coordinateSpace.coordinate(atFraction: fractionStart)
        let corner2 = coordinateSpace.coordinate(atFraction: fractionEnd)
        let minLat = min(corner1.lat, corner2.lat)
        let maxLat = max(corner1.lat, corner2.lat)
        let minLng = min(corner1.lng, corner2.lng)
        let maxLng = max(corner1.lng, corner2.lng)
        // Anillo cerrado (primer punto == último), como produce Leaflet.draw.
        let ring: [[Double]] = [
            [minLng, minLat], [maxLng, minLat], [maxLng, maxLat], [minLng, maxLat], [minLng, minLat],
        ]
        let feature = GeoJSONFeature(geometry: .init(coordinates: [ring]))

        guard let data = try? JSONEncoder().encode(feature),
              let geojson = String(data: data, encoding: .utf8) else {
            zoneError = "No se pudo generar la geometría de la zona."
            return
        }

        let api = GestorAPI(settings: settings, session: session)
        do {
            let zone = try await api.createZone(mapID: mapID, name: name,
                                                type: "rectangle", geojson: geojson,
                                                color: "#7c5cff")
            zones.append(zone)
        } catch let error as APIError {
            zoneError = error.kind == .forbidden
                ? "No puedes crear zonas en este plano: no eres su autor ni administrador."
                : error.message
        } catch {
            zoneError = error.localizedDescription
        }
    }

    func deleteZone(_ zone: MapZone, settings: AppSettings, session: SessionStore) async {
        guard let mapID = selectedMapID else { return }
        zoneError = nil
        let api = GestorAPI(settings: settings, session: session)
        do {
            try await api.deleteZone(mapID: mapID, zoneID: zone.id)
            zones.removeAll { $0.id == zone.id }
        } catch let error as APIError {
            zoneError = error.kind == .forbidden
                ? "No puedes borrar esta zona: no eres su autora ni administrador."
                : error.message
        } catch {
            zoneError = error.localizedDescription
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
}
