import AppKit
import SwiftUI

/// Miniatura interactiva del plano seleccionado en el editor: toca la imagen
/// para fijar `x`/`y` en vez de escribirlas a mano. Usa el mismo
/// `PlanCoordinateSpace` que `PlanView`, así que un punto marcado aquí cae en
/// el mismo sitio del plano que luego se ve en el detalle de la tarea.
///
/// La función inversa (`coordinate(atFraction:)`) ya existía en
/// `PlanCoordinateSpace` sin usar — esto es lo que le faltaba conectar.
struct MapCoordinatePicker: View {
    let mapID: Int
    @Binding var x: String
    @Binding var y: String

    @Environment(SessionStore.self) private var session
    @Environment(AppSettings.self) private var settings
    @State private var model = MapCoordinatePickerViewModel()

    var body: some View {
        Group {
            if model.isLoading {
                HStack { Spacer(); ProgressView().controlSize(.small); Spacer() }
                    .frame(height: 160)
            } else if let error = model.errorMessage {
                Text(error).font(.caption).foregroundStyle(.red)
            } else if let image = model.image {
                canvas(image: image)
            } else {
                // Estado transitorio antes de que `.task(id:)` arranque (mismo
                // hueco que tenía IssueDetailView.swift): sin este reintento la
                // miniatura se queda en blanco de forma indefinida.
                HStack { Spacer(); ProgressView().controlSize(.small); Spacer() }
                    .frame(height: 160)
                    .task { await model.load(mapID: mapID, settings: settings, session: session) }
            }
        }
        .task(id: mapID) {
            await model.load(mapID: mapID, settings: settings, session: session)
        }
    }

    private func canvas(image: NSImage) -> some View {
        GeometryReader { proxy in
            let size = Self.aspectFitSize(imageSize: image.size, in: proxy.size)
            ZStack(alignment: .topLeading) {
                Image(nsImage: image)
                    .resizable()
                    .frame(width: size.width, height: size.height)
                if let point = currentPoint(in: size) {
                    Circle()
                        .fill(Theme.accent)
                        .frame(width: 14, height: 14)
                        .overlay(Circle().stroke(.white, lineWidth: 2))
                        .position(point)
                }
            }
            .frame(width: proxy.size.width, height: proxy.size.height, alignment: .topLeading)
            .contentShape(Rectangle())
            .gesture(
                DragGesture(minimumDistance: 0)
                    .onEnded { value in place(at: value.location, in: size) }
            )
        }
        .frame(height: 220)
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .background(Theme.chip, in: RoundedRectangle(cornerRadius: 10))
    }

    private func place(at location: CGPoint, in size: CGSize) {
        guard size.width > 0, size.height > 0 else { return }
        let fx = min(max(location.x / size.width, 0), 1)
        let fy = min(max(location.y / size.height, 0), 1)
        let coord = model.coordinateSpace.coordinate(atFraction: CGPoint(x: fx, y: fy))
        x = Self.formatted(coord.lat)
        y = Self.formatted(coord.lng)
    }

    private func currentPoint(in size: CGSize) -> CGPoint? {
        guard let xValue = IssueDraft.number(from: x), let yValue = IssueDraft.number(from: y) else { return nil }
        let fraction = model.coordinateSpace.fraction(lat: xValue, lng: yValue)
        guard fraction.x.isFinite, fraction.y.isFinite else { return nil }
        return CGPoint(x: fraction.x * size.width, y: fraction.y * size.height)
    }

    private static func formatted(_ value: Double) -> String {
        value == value.rounded() ? String(Int(value)) : String(format: "%.1f", value)
    }

    private static func aspectFitSize(imageSize: CGSize, in bounds: CGSize) -> CGSize {
        guard imageSize.width > 0, imageSize.height > 0,
              bounds.width > 0, bounds.height > 0 else { return bounds }
        let scale = min(bounds.width / imageSize.width, bounds.height / imageSize.height)
        return CGSize(width: imageSize.width * scale, height: imageSize.height * scale)
    }
}

@MainActor
@Observable
final class MapCoordinatePickerViewModel {
    var image: NSImage?
    var coordinateSpace = PlanCoordinateSpace(imageWidth: 1000, imageHeight: 1000)
    var isLoading = false
    var errorMessage: String?

    private var loadedMapID: Int?

    func load(mapID: Int, settings: AppSettings, session: SessionStore) async {
        guard loadedMapID != mapID else { return }
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        let api = GestorAPI(settings: settings, session: session)
        do {
            let detail = try await api.mapDetail(id: mapID)
            guard let url = settings.mediaURL(detail.fileURL) else {
                errorMessage = "No se pudo resolver la URL del plano."
                return
            }
            let (loadedImage, pixelSize) = try await RemoteImage.load(from: url)
            image = loadedImage
            coordinateSpace = PlanCoordinateSpace(imageSize: pixelSize)
            loadedMapID = mapID
        } catch let error as APIError {
            errorMessage = error.message
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
