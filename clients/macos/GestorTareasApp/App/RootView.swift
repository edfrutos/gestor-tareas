import AppKit
import SwiftUI

struct RootView: View {
    @Environment(SessionStore.self) private var session
    @Environment(UpdateChecker.self) private var updateChecker

    /// La release que el usuario ya descartó con "Ahora no" — se compara por
    /// valor contra `updateChecker.latestRelease` para no reabrir el aviso de
    /// la misma versión, pero sí volver a mostrarlo si aparece una más nueva
    /// (o si una comprobación manual encuentra otra distinta).
    @State private var dismissedRelease: AppRelease?

    var body: some View {
        Group {
            switch session.state {
            case .signedOut:
                LoginView()
            case .signedIn:
                MainView()
            }
        }
        .task { await updateChecker.checkIfNeeded() }
        .alert(
            "Nueva versión disponible",
            isPresented: Binding(
                get: { updateChecker.hasUpdate && updateChecker.latestRelease != dismissedRelease },
                set: { isPresented in if !isPresented { dismissedRelease = updateChecker.latestRelease } }
            )
        ) {
            #if !MAS_BUILD
            if let dmgURL = updateChecker.latestRelease?.dmgURL {
                Button("Descargar") { NSWorkspace.shared.open(dmgURL) }
            }
            #endif
            if let notesURL = updateChecker.latestRelease?.releaseNotesURL {
                Button("Ver notas de la versión") { NSWorkspace.shared.open(notesURL) }
            }
            Button("Ahora no", role: .cancel) {}
        } message: {
            if let release = updateChecker.latestRelease {
                #if MAS_BUILD
                Text("Hay una nueva versión de Gestor de Tareas disponible: \(release.displayName). Se instalará automáticamente desde la Mac App Store.")
                #else
                Text("Hay una nueva versión de Gestor de Tareas disponible: \(release.displayName).")
                #endif
            }
        }
    }
}
