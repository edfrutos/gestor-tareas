import AppKit
import ImageIO

/// Descarga una imagen y devuelve también su tamaño **real en píxeles**
/// (distinto del tamaño lógico de `NSImage.size`) — lo necesita
/// `PlanCoordinateSpace` para reproducir el sistema de coordenadas de la web.
/// Compartido entre `PlanViewModel` y `MapCoordinatePickerViewModel` para no
/// duplicar la misma lógica de descarga en dos sitios.
enum RemoteImage {
    static func load(from url: URL) async throws -> (image: NSImage, pixelSize: CGSize) {
        let (data, response) = try await URLSession.shared.data(from: url)
        if let http = response as? HTTPURLResponse, !(200...299).contains(http.statusCode) {
            throw APIError.from(status: http.statusCode, data: data)
        }
        guard let image = NSImage(data: data) else {
            throw APIError.transport(message: "No se pudo decodificar la imagen.")
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
