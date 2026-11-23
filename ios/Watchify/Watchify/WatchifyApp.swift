import SwiftUI

@main
@MainActor
struct WatchifyApp: App {
    var body: some Scene {
        WindowGroup {
            WatchifyRootView()
                .preferredColorScheme(.dark)
                .tint(WatchifyAppearance.gold)
        }
    }
}
