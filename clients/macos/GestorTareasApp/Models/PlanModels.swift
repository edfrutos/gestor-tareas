import CoreGraphics
import Foundation

// MARK: - Plano con capas  (GET /v1/maps/:id)

/// Capa técnica: otro plano (`maps`) con `parent_id` apuntando al principal,
/// dibujada como imagen superpuesta a la misma escala (ver
/// `src/public/ui/modules/map.js::loadMapLayers`, opacidad fija 0.7).
struct MapLayer: Codable, Identifiable, Hashable {
    let id: Int
    let name: String
    let fileURL: String

    enum CodingKeys: String, CodingKey {
        case id, name
        case fileURL = "file_url"
    }
}

struct MapDetail: Codable, Identifiable {
    let id: Int
    let name: String
    let fileURL: String
    let thumbURL: String?
    let parentID: Int?
    let layers: [MapLayer]

    enum CodingKeys: String, CodingKey {
        case id, name, layers
        case fileURL = "file_url"
        case thumbURL = "thumb_url"
        case parentID = "parent_id"
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(Int.self, forKey: .id)
        name = try c.decodeIfPresent(String.self, forKey: .name) ?? "Plano \(id)"
        fileURL = try c.decode(String.self, forKey: .fileURL)
        thumbURL = try c.decodeIfPresent(String.self, forKey: .thumbURL)
        parentID = try c.decodeIfPresent(Int.self, forKey: .parentID)
        layers = try c.decodeIfPresent([MapLayer].self, forKey: .layers) ?? []
    }
}

// MARK: - Biblioteca de planos  (GET /v1/maps?include_archived=…)

/// Fila completa de la tabla `maps`, para la pantalla de biblioteca (ver,
/// archivar/restaurar, borrar) — a diferencia de `MapRef` (selector ligero del
/// editor/filtros), incluye miniatura, autor y estado de archivado.
struct LibraryMap: Codable, Identifiable, Hashable {
    let id: Int
    let name: String
    let fileURL: String
    let thumbURL: String?
    let parentID: Int?
    let createdBy: Int?
    let createdByUsername: String?
    private let archivedRaw: Int

    var isArchived: Bool { archivedRaw != 0 }
    /// El plano `id == 1` es el "plano del sistema": ni se archiva ni se borra
    /// (mismo criterio que `src/routes/maps.routes.js` y `maps.js` en la web).
    var isSystem: Bool { id == 1 }

    enum CodingKeys: String, CodingKey {
        case id, name
        case fileURL = "file_url"
        case thumbURL = "thumb_url"
        case parentID = "parent_id"
        case createdBy = "created_by"
        case createdByUsername = "created_by_username"
        case archivedRaw = "archived"
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(Int.self, forKey: .id)
        name = try c.decodeIfPresent(String.self, forKey: .name) ?? "Plano \(id)"
        fileURL = try c.decode(String.self, forKey: .fileURL)
        thumbURL = try c.decodeIfPresent(String.self, forKey: .thumbURL)
        parentID = try c.decodeIfPresent(Int.self, forKey: .parentID)
        createdBy = try c.decodeIfPresent(Int.self, forKey: .createdBy)
        createdByUsername = try c.decodeIfPresent(String.self, forKey: .createdByUsername)
        archivedRaw = try c.decodeIfPresent(Int.self, forKey: .archivedRaw) ?? 0
    }
}

// MARK: - Zonas  (GET /v1/maps/:mapId/zones)

/// Zona dibujada sobre un plano. `geojson` es una cadena con un `Feature`
/// GeoJSON (`src/public/ui/modules/map.js` guarda `layer.toGeoJSON()` tal cual);
/// solo se admite geometría `Polygon` (los rectángulos de Leaflet.draw también
/// se serializan como `Polygon`).
struct MapZone: Codable, Identifiable {
    let id: Int
    let mapID: Int
    let name: String
    let type: String
    let geojson: String
    let color: String
    let createdBy: Int
    let createdAt: String

    enum CodingKeys: String, CodingKey {
        case id, name, type, geojson, color
        case mapID = "map_id"
        case createdBy = "created_by"
        case createdAt = "created_at"
    }

    /// Anillos del polígono (exterior + agujeros) como fracciones `(0...1, 0...1)`
    /// del plano, con origen arriba-izquierda (convención SwiftUI). Vacío si el
    /// GeoJSON no se pudo interpretar como `Polygon`.
    func polygonRings(in space: PlanCoordinateSpace) -> [[CGPoint]] {
        guard let data = geojson.data(using: .utf8),
              let feature = try? JSONDecoder().decode(GeoJSONFeature.self, from: data),
              feature.geometry.type == "Polygon" else {
            return []
        }
        return feature.geometry.coordinates.map { ring in
            ring.compactMap { coordinate -> CGPoint? in
                guard coordinate.count >= 2 else { return nil }
                // GeoJSON: [lng, lat]. El backend guarda lat/lng "de plano" (ver
                // `docs/PLAN_APP_MACOS.md` y `PlanCoordinateSpace`), no GPS.
                return space.fraction(lat: coordinate[1], lng: coordinate[0])
            }
        }
    }
}

/// Subconjunto mínimo de GeoJSON que necesitamos leer/escribir: un `Feature`
/// con geometría `Polygon` (`coordinates: [ [ [lng,lat], ... ] ]`, un array
/// por anillo). `Codable` en los dos sentidos: se decodifica al pintar zonas
/// ya existentes y se codifica al crear una nueva (`PlanViewModel.createRectangleZone`).
struct GeoJSONFeature: Codable {
    struct Geometry: Codable {
        var type = "Polygon"
        let coordinates: [[[Double]]]
    }
    var type = "Feature"
    let geometry: Geometry
}
