import AppKit
import SwiftUI

/// Paleta de marca, calcada 1:1 de las variables CSS de la web
/// (`src/public/index.html:22-53`), adaptable claro/oscuro igual que allí
/// (la web tiene modo auto/claro/oscuro y se ve bien en los tres).
/// `--bg` (el fondo de ventana) se deja fuera a propósito: en macOS ese lo da
/// el sistema (materiales de la sidebar, barra de título) y pelearse con él
/// suele verse peor que dejar que sea nativo. `--panel`/`--border`/`--chip` sí
/// se replican, para las tarjetas de contenido propio (filas de lista, etc.).
enum Theme {
    /// `--accent` (web).
    static let accent = Color(hex: "#7c5cff")
    /// `--ok` (web).
    static let ok = Color(hex: "#2ecc71")
    /// `--warn` (web).
    static let warn = Color(hex: "#f39c12")
    /// `--bad` (web).
    static let bad = Color(hex: "#ff5c7a")

    /// Fondo de "tarjeta" (`--panel`: rgba(0,0,0,.05) claro / rgba(255,255,255,.06)
    /// oscuro) — para las filas de la lista, a diferencia de los tokens de arriba
    /// esto sí conviene que sea adaptable, ya que la web tiene los tres modos
    /// (auto/claro/oscuro) y se ve bien en ambos.
    static let panel = Color(light: .black.opacity(0.05), dark: .white.opacity(0.06))
    /// Borde de tarjeta (`--border2`).
    static let cardBorder = Color(light: .black.opacity(0.10), dark: .white.opacity(0.10))
    /// Fondo de "chip"/insignia neutra (`--chip`).
    static let chip = Color(light: .black.opacity(0.06), dark: .white.opacity(0.09))
}

extension Color {
    /// Color que cambia con el modo claro/oscuro del sistema, calcado del
    /// patrón `:root` (oscuro) / `[data-theme="light"]` de la web.
    init(light: Color, dark: Color) {
        self.init(NSColor(name: nil) { appearance in
            let isDark = appearance.bestMatch(from: [.aqua, .darkAqua]) == .darkAqua
            return NSColor(isDark ? dark : light)
        })
    }
}

private struct CardStyle: ViewModifier {
    func body(content: Content) -> some View {
        content
            .padding(16)
            .background(Theme.panel, in: RoundedRectangle(cornerRadius: 14))
            .overlay(RoundedRectangle(cornerRadius: 14).stroke(Theme.cardBorder, lineWidth: 1))
    }
}

extension View {
    /// Panel de "tarjeta" (fondo + borde redondeado) para agrupar una sección
    /// de contenido propio — mismo tratamiento que las filas de la lista.
    func cardStyle() -> some View { modifier(CardStyle()) }
}
