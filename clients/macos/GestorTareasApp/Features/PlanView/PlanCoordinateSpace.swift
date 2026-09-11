import CoreGraphics

/// Reproduce el sistema de coordenadas que usa la SPA web para el plano
/// (`src/public/ui/modules/map.js`, Leaflet con `CRS.Simple`):
///
/// - El eje **largo** de la imagen se normaliza a 1000 unidades; el corto queda
///   en `1000 * corto/largo` (`getImageBoundsFromDimensions`). No son píxeles
///   reales de la imagen.
/// - El origen `(0,0)` está abajo-izquierda y el eje Y crece **hacia arriba**
///   (convención Leaflet/cartesiana), al revés que una vista o una imagen.
/// - `issue.lat` es la coordenada Y (vertical) e `issue.lng` la X (horizontal)
///   en ese espacio — nombres heredados de Leaflet, no son GPS.
///
/// Esta es la pieza que hay que acertar para que un pin caiga en el mismo sitio
/// del plano en la app nativa que en la web.
struct PlanCoordinateSpace: Equatable {
    let virtualWidth: Double
    let virtualHeight: Double

    init(imageWidth: Double, imageHeight: Double) {
        guard imageWidth > 0, imageHeight > 0 else {
            virtualWidth = 1000
            virtualHeight = 1000
            return
        }
        if imageWidth >= imageHeight {
            virtualWidth = 1000
            virtualHeight = 1000 * imageHeight / imageWidth
        } else {
            virtualHeight = 1000
            virtualWidth = 1000 * imageWidth / imageHeight
        }
    }

    init(imageSize: CGSize) {
        self.init(imageWidth: Double(imageSize.width), imageHeight: Double(imageSize.height))
    }

    /// `(lat, lng)` del backend → posición fraccional `(0...1, 0...1)` dentro de
    /// la imagen, origen arriba-izquierda (para multiplicar por el tamaño en
    /// puntos con el que se está dibujando la imagen).
    func fraction(lat: Double, lng: Double) -> CGPoint {
        let fx = virtualWidth > 0 ? lng / virtualWidth : 0
        let fy = virtualHeight > 0 ? 1 - (lat / virtualHeight) : 0
        return CGPoint(x: fx, y: fy)
    }

    /// Inverso de `fraction`: posición fraccional (arriba-izquierda) → `(lat, lng)`.
    func coordinate(atFraction point: CGPoint) -> (lat: Double, lng: Double) {
        let lng = Double(point.x) * virtualWidth
        let lat = (1 - Double(point.y)) * virtualHeight
        return (lat, lng)
    }
}
