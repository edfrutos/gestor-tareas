import SwiftUI

@main
struct GestorTareasApp: App {
    @State private var settings = AppSettings()
    @State private var session = SessionStore()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(settings)
                .environment(session)
                .frame(minWidth: 940, minHeight: 620)
        }
        .commands {
            CommandGroup(replacing: .appInfo) {}
        }

        Settings {
            PreferencesView()
                .environment(settings)
        }
    }
}
