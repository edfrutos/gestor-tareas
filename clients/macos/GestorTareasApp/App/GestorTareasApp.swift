import SwiftUI

@main
struct GestorTareasApp: App {
    @State private var settings = AppSettings()
    @State private var session = SessionStore()
    @State private var socket = SocketClient()
    @State private var router = DeepLinkRouter()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(settings)
                .environment(session)
                .environment(socket)
                .environment(router)
                .frame(minWidth: 940, minHeight: 620)
                .tint(Theme.accent)
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
                .tint(Theme.accent)
        }
    }
}
