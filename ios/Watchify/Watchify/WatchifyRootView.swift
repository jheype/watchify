import SwiftUI

enum WatchifyAppearance {
    static let background = Color(red: 16 / 255, green: 18 / 255, blue: 17 / 255)
    static let panel = Color(red: 23 / 255, green: 26 / 255, blue: 24 / 255)
    static let ivory = Color(red: 241 / 255, green: 240 / 255, blue: 233 / 255)
    static let muted = Color(red: 163 / 255, green: 168 / 255, blue: 158 / 255)
    static let gold = Color(red: 199 / 255, green: 170 / 255, blue: 118 / 255)
}

@MainActor
struct WatchifyRootView: View {
    @StateObject private var session = WatchifyWebSession()
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        ZStack {
            WatchifyAppearance.background.ignoresSafeArea()
            WatchifyWebView(session: session)
                .ignoresSafeArea(.container, edges: .bottom)
                .accessibilityHidden(session.blocksContent || session.showsPrivacyShield)

            if session.blocksContent {
                connectionView
                    .transition(.opacity)
            }

            if session.showsPrivacyShield {
                WatchifyAppearance.background.ignoresSafeArea()
                VStack(spacing: 12) {
                    wordmark
                    Text("Your collection stays personal.")
                        .font(.callout)
                        .foregroundStyle(WatchifyAppearance.muted)
                }
                .accessibilityElement(children: .combine)
            }
        }
        .safeAreaInset(edge: .top, spacing: 0) {
            if !session.blocksContent && !session.showsPrivacyShield {
                if session.isOffline {
                    HStack(alignment: .top, spacing: 9) {
                        Image(systemName: "wifi.slash")
                        Text("Offline. Keep Watchify open until your changes are saved.")
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .font(.footnote)
                    .foregroundStyle(WatchifyAppearance.ivory)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 10)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(WatchifyAppearance.panel)
                    .accessibilityElement(children: .combine)
                } else if let notice = session.notice {
                    HStack(alignment: .top, spacing: 9) {
                        Text(notice).fixedSize(horizontal: false, vertical: true)
                        Spacer(minLength: 0)
                        Button { session.clearNotice() } label: {
                            Image(systemName: "xmark")
                        }
                        .accessibilityLabel("Dismiss notice")
                        .padding(4)
                    }
                    .font(.footnote)
                    .foregroundStyle(WatchifyAppearance.ivory)
                    .padding(12)
                    .background(WatchifyAppearance.panel)
                }
            }
        }
        .onAppear { session.handleScenePhase(scenePhase) }
        .onChange(of: scenePhase) { _, phase in session.handleScenePhase(phase) }
    }

    private var wordmark: some View {
        (Text("watchify") + Text(".").foregroundColor(WatchifyAppearance.gold))
            .font(.system(.largeTitle, design: .serif))
            .foregroundStyle(WatchifyAppearance.ivory)
            .accessibilityLabel("Watchify")
    }

    private var connectionView: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                wordmark
                Text("COLLECTION INTELLIGENCE")
                    .font(.caption.weight(.semibold))
                    .tracking(2)
                    .foregroundStyle(WatchifyAppearance.gold)

                if let failure = session.failure {
                    Image(systemName: failure.symbol)
                        .font(.system(size: 30, weight: .light))
                        .foregroundStyle(WatchifyAppearance.gold)
                        .accessibilityHidden(true)
                    Text(failure.title)
                        .font(.system(.largeTitle, design: .serif))
                        .foregroundStyle(WatchifyAppearance.ivory)
                    Text(failure.message)
                        .font(.body)
                        .lineSpacing(5)
                        .foregroundStyle(WatchifyAppearance.muted)
                    Button(action: session.retry) {
                        Text(failure.retryLabel)
                            .font(.body.weight(.semibold))
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 15)
                    }
                    .foregroundStyle(WatchifyAppearance.background)
                    .background(WatchifyAppearance.gold, in: RoundedRectangle(cornerRadius: 7))
                    .accessibilityHint("Opens the latest Watchify workspace saved to your account.")
                } else {
                    Text(session.isOffline ? "A connection is needed." : "Your collection awaits.")
                        .font(.system(.largeTitle, design: .serif))
                        .foregroundStyle(WatchifyAppearance.ivory)
                    Text(session.isOffline
                         ? "Connect to the internet to open your Watchify account."
                         : "Opening your private Watchify workspace.")
                        .font(.body)
                        .foregroundStyle(WatchifyAppearance.muted)
                    ProgressView()
                        .tint(WatchifyAppearance.gold)
                        .accessibilityLabel("Opening Watchify")
                }
            }
            .padding(28)
            .frame(maxWidth: 520, alignment: .leading)
            .frame(maxWidth: .infinity, minHeight: 420, alignment: .center)
        }
        .background(WatchifyAppearance.background.ignoresSafeArea())
        .accessibilityElement(children: .contain)
    }
}
