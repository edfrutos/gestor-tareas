import Foundation
import Observation

/// Release del cliente macOS publicada en GitHub Releases, ya parseada y
/// comparable contra el binario en ejecución.
struct AppRelease: Equatable {
    let version: String   // "0.1.0"
    let build: Int        // 2
    let releaseNotesURL: URL
    /// `nil` si el release no tiene ningún asset `.dmg` adjunto todavía.
    let dmgURL: URL?

    var displayName: String { "\(version) (build \(build))" }
}

/// Comprueba si hay una versión del cliente macOS más reciente que la
/// instalada, usando los releases de GitHub como única fuente de verdad
/// (no hay backend propio para esto — ver `docs/PLAN_APP_MACOS.md`).
///
/// Cubre los dos canales de distribución: en Mac App Store el propio App
/// Store ya actualiza solo, así que aquí solo se informa (sin botón de
/// descarga — Apple gestiona esa actualización, no nosotros); en Developer
/// ID no hay ningún mecanismo de actualización, así que se ofrece el enlace
/// directo al `.dmg` del release (ver `#if MAS_BUILD` en las vistas).
@MainActor
@Observable
final class UpdateChecker {
    private static let repo = "edfrutos/gestor-tareas"
    /// Solo tags con este prefijo son releases del cliente macOS — el mismo
    /// repo también tiene tags del backend (`v1.0.0`, ver
    /// GITHUB_SECRETS_SETUP.md) que no nos interesan aquí.
    private static let tagPrefix = "macos-v"
    private static let lastCheckDefaultsKey = "updateChecker.lastCheckedAt"
    /// No merece la pena comprobar más a menudo que esto en el arranque
    /// automático (la API de GitHub sin autenticar limita a 60 peticiones/hora
    /// por IP); "Buscar actualizaciones…" desde el menú siempre fuerza.
    private static let autoCheckInterval: TimeInterval = 24 * 60 * 60

    private(set) var latestRelease: AppRelease?
    private(set) var isChecking = false
    private(set) var lastError: String?

    var hasUpdate: Bool {
        guard let latestRelease else { return false }
        return Self.isNewer(latestRelease, than: Self.runningVersion)
    }

    nonisolated static var runningVersion: (version: String, build: Int) {
        let info = Bundle.main.infoDictionary
        let version = info?["CFBundleShortVersionString"] as? String ?? "0"
        let build = Int(info?["CFBundleVersion"] as? String ?? "0") ?? 0
        return (version, build)
    }

    /// Comprobación silenciosa al arrancar: no hace nada si ya se comprobó
    /// hace menos de `autoCheckInterval`.
    func checkIfNeeded() async {
        let last = UserDefaults.standard.double(forKey: Self.lastCheckDefaultsKey)
        let elapsed = Date().timeIntervalSince1970 - last
        guard elapsed > Self.autoCheckInterval else { return }
        await check()
    }

    /// Comprobación forzada (botón/menú "Buscar actualizaciones…").
    func check() async {
        isChecking = true
        lastError = nil
        defer { isChecking = false }

        do {
            let releases = try await Self.fetchReleases()
            UserDefaults.standard.set(Date().timeIntervalSince1970, forKey: Self.lastCheckDefaultsKey)
            latestRelease = Self.newest(of: releases)
        } catch {
            lastError = "No se pudo comprobar si hay una versión nueva."
        }
    }

    // MARK: - Red

    private static func fetchReleases() async throws -> [AppRelease] {
        var request = URLRequest(url: URL(string: "https://api.github.com/repos/\(repo)/releases?per_page=10")!)
        request.setValue("application/vnd.github+json", forHTTPHeaderField: "Accept")
        // La API de GitHub rechaza peticiones sin User-Agent.
        request.setValue("GestorTareas-macOS-UpdateChecker", forHTTPHeaderField: "User-Agent")
        request.timeoutInterval = 8

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw URLError(.badServerResponse)
        }

        let decoded = try JSONDecoder().decode([GitHubReleaseDTO].self, from: data)
        return decoded.compactMap { $0.asAppRelease(tagPrefix: tagPrefix) }
    }

    // MARK: - Comparación de versiones (pura, testeable sin red ni MainActor)

    nonisolated static func newest(of releases: [AppRelease]) -> AppRelease? {
        releases.max { a, b in isNewer(b, than: (a.version, a.build)) }
    }

    nonisolated static func isNewer(_ release: AppRelease, than current: (version: String, build: Int)) -> Bool {
        let cmp = compareVersions(release.version, current.version)
        if cmp != .orderedSame { return cmp == .orderedDescending }
        return release.build > current.build
    }

    /// Compara dos versiones "x.y.z" componente a componente (sin asumir que
    /// tengan el mismo número de componentes).
    nonisolated static func compareVersions(_ a: String, _ b: String) -> ComparisonResult {
        let av = a.split(separator: ".").compactMap { Int($0) }
        let bv = b.split(separator: ".").compactMap { Int($0) }
        for i in 0..<max(av.count, bv.count) {
            let x = i < av.count ? av[i] : 0
            let y = i < bv.count ? bv[i] : 0
            if x != y { return x < y ? .orderedAscending : .orderedDescending }
        }
        return .orderedSame
    }
}

/// DTO mínimo de `GET /repos/:owner/:repo/releases` — solo los campos que
/// necesitamos, ver https://docs.github.com/rest/releases/releases.
struct GitHubReleaseDTO: Decodable {
    let tagName: String
    let htmlURL: URL
    let draft: Bool
    let assets: [Asset]

    struct Asset: Decodable {
        let name: String
        let browserDownloadURL: URL

        enum CodingKeys: String, CodingKey {
            case name
            case browserDownloadURL = "browser_download_url"
        }
    }

    enum CodingKeys: String, CodingKey {
        case tagName = "tag_name"
        case htmlURL = "html_url"
        case draft
        case assets
    }

    /// Parsea tags con forma `macos-v<version>-<build>` (p. ej.
    /// `macos-v0.1.0-2`, ver memoria `macos-hito5-xcode-beta-blocker` /
    /// `gestor-tareas-prod-deploy`). `nil` para drafts o cualquier otro tag
    /// (los del backend, p. ej. `v1.0.0`).
    func asAppRelease(tagPrefix: String) -> AppRelease? {
        guard !draft, tagName.hasPrefix(tagPrefix) else { return nil }
        let rest = tagName.dropFirst(tagPrefix.count) // "0.1.0-2"
        guard let dashIndex = rest.lastIndex(of: "-"),
              let build = Int(rest[rest.index(after: dashIndex)...]) else { return nil }
        let version = String(rest[..<dashIndex])
        let dmg = assets.first { $0.name.hasSuffix(".dmg") }?.browserDownloadURL
        return AppRelease(version: version, build: build, releaseNotesURL: htmlURL, dmgURL: dmg)
    }
}
