import Foundation

/// Navigation and bridge policy are deliberately independent of WebKit so the
/// hostile URL cases can be tested without running a web process.
enum WatchifyNavigationPolicy {
    static let canonicalHost = "watchify-azure.vercel.app"
    static let homeURL = URL(string: "https://watchify-azure.vercel.app/")!
    static let recoveryURL = URL(string: "https://watchify-azure.vercel.app/?watchify_access=reset")!

    enum Destination: Equatable {
        case watchify
        case externalBrowser
        case blocked
    }

    static func isTrusted(_ url: URL?) -> Bool {
        guard let url, let components = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return false }
        return components.scheme?.lowercased() == "https"
            && components.host?.lowercased() == canonicalHost
            && (components.port == nil || components.port == 443)
            && components.user == nil
            && components.password == nil
    }

    static func isTrustedOrigin(scheme: String, host: String, port: Int, mainFrame: Bool) -> Bool {
        mainFrame && scheme.lowercased() == "https"
            && host.lowercased() == canonicalHost
            && (port == 0 || port == 443)
    }

    static func destination(for url: URL?, explicitLink: Bool) -> Destination {
        if isTrusted(url) { return .watchify }
        guard explicitLink, let url,
              let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
              components.scheme?.lowercased() == "https",
              components.user == nil, components.password == nil,
              components.port == nil || components.port == 443,
              components.query == nil else { return .blocked }

        // The public project is the only external destination currently used
        // by this product. An arbitrary link cannot open another native app.
        if components.host?.lowercased() == "github.com",
           components.path == "/jheype/watchify" || components.path.hasPrefix("/jheype/watchify/") {
            return .externalBrowser
        }
        return .blocked
    }
}
