import SwiftUI

/// Paleta de marca, calcada 1:1 de las variables CSS de la web
/// (`src/public/index.html:22-39`, tema oscuro por defecto — es el mismo en
/// claro y oscuro, la web no redefine estos cuatro en `[data-theme="light"]`).
/// Deliberadamente no forzamos los colores de fondo/panel del `:root` (`--bg`,
/// `--panel`, `--border`...) sobre la ventana: en macOS esos los da el sistema
/// (materiales de la sidebar, barra de título) y pelearse con ellos suele
/// verse peor que dejar que sea verdaderamente nativo.
enum Theme {
    /// `--accent` (web).
    static let accent = Color(hex: "#7c5cff")
    /// `--ok` (web).
    static let ok = Color(hex: "#2ecc71")
    /// `--warn` (web).
    static let warn = Color(hex: "#f39c12")
    /// `--bad` (web).
    static let bad = Color(hex: "#ff5c7a")
}
