import SwiftUI

@main
struct GestorTareasApp: App {
    @State private var settings = AppSettings()
    @State private var session = SessionStore()
    @State private var socket = SocketClient()
    @State private var router = DeepLinkRouter()
    @State private var updateChecker = UpdateChecker()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(settings)
                .environment(session)
                .environment(socket)
                .environment(router)
                .environment(updateChecker)
                .frame(minWidth: 940, minHeight: 620)
                .tint(Theme.accent)
                .preferredColorScheme(settings.appearanceMode.colorScheme)
                .onOpenURL { url in
                    router.handle(url)
                }
        }
        .commands {
            CommandGroup(replacing: .appInfo) {}
        }

        Settings {
            PreferencesView()
                .environment(settings)
                .environment(updateChecker)
                .tint(Theme.accent)
                .preferredColorScheme(settings.appearanceMode.colorScheme)
        }
    }
}
