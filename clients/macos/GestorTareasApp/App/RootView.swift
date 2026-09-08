import SwiftUI

struct RootView: View {
    @Environment(SessionStore.self) private var session

    var body: some View {
        switch session.state {
        case .signedOut:
            LoginView()
        case .signedIn:
            MainView()
        }
    }
}
