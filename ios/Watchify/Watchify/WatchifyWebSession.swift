import Combine
import Foundation
import Network
import SafariServices
import SwiftUI
import UIKit
import WebKit

struct WatchifyLoadFailure: Equatable {
    let title: String
    let message: String
    let symbol: String
    let retryLabel: String

    static let connection = WatchifyLoadFailure(
        title: "Your collection is still yours.",
        message: "Watchify could not connect. Check your connection, then try again. Your saved collection stays in your account.",
        symbol: "wifi.slash", retryLabel: "Try again"
    )
    static let interrupted = WatchifyLoadFailure(
        title: "Let’s reopen your collection.",
        message: "iOS closed this page. Changes already saved to your account remain available. Anything that had not finished saving may need to be entered again.",
        symbol: "arrow.clockwise", retryLabel: "Reopen saved workspace"
    )
    static let unavailable = WatchifyLoadFailure(
        title: "Watchify could not open.",
        message: "The page is temporarily unavailable. Try again to open the latest saved workspace.",
        symbol: "exclamationmark.circle", retryLabel: "Try again"
    )
}

/// Owns one web session. Account tokens remain inside WebKit's persistent site
/// storage; the Swift layer never reads or forwards them.
@MainActor
final class WatchifyWebSession: NSObject, ObservableObject {
    @Published private(set) var failure: WatchifyLoadFailure?
    @Published private(set) var hasContent = false
    @Published private(set) var isOffline = false
    @Published private(set) var showsPrivacyShield = false
    @Published private(set) var notice: String?

    var blocksContent: Bool { failure != nil || !hasContent }

    private weak var webView: WKWebView?
    private weak var container: WatchifyWebContainerController?
    private var contextGeneration = UUID()
    private var sceneActive = true
    private var monitor: NWPathMonitor?
    private let monitorQueue = DispatchQueue(label: "com.jheype.watchify.connection")
    private var navigationTimeout: Task<Void, Never>?
    private var activeExport: ActiveExport?
    private var pendingDialog: PendingDialog?
    private var pendingRecovery: PendingRecovery?
    private var recoveryOpening = false
    private var seenDownloadIDs = Set<UUID>()
    private var downloadOrder: [UUID] = []
    private weak var browserController: SFSafariViewController?
    private let exportsDirectory: URL
    private static var cleanedExportsThisLaunch = false

    private typealias Reply = @MainActor @Sendable (Any?, String?) -> Void

    @MainActor
    private final class ActiveExport {
        let requestID: UUID
        let generation: UUID
        let directory: URL
        let controller: UIActivityViewController
        let reply: Reply
        var presented = false

        init(requestID: UUID, generation: UUID, directory: URL, controller: UIActivityViewController, reply: @escaping Reply) {
            self.requestID = requestID
            self.generation = generation
            self.directory = directory
            self.controller = controller
            self.reply = reply
        }
    }

    private struct PendingDialog {
        let id: UUID
        let controller: UIAlertController
        let cancel: @MainActor @Sendable () -> Void
    }

    private struct PendingRecovery {
        let id: UUID
        let generation: UUID
        let reply: Reply
    }

    override init() {
        exportsDirectory = FileManager.default.temporaryDirectory.appendingPathComponent("WatchifyExports", isDirectory: true)
        super.init()
        // This directory only contains app-created, temporary export files.
        // Removing it on launch also cleans artifacts left by a terminated app.
        if !Self.cleanedExportsThisLaunch {
            try? FileManager.default.removeItem(at: exportsDirectory)
            Self.cleanedExportsThisLaunch = true
        }
        let monitor = NWPathMonitor()
        monitor.pathUpdateHandler = { [weak self] path in
            let offline = path.status != .satisfied
            Task { @MainActor [weak self] in
                guard let self else { return }
                let reconnected = self.isOffline && !offline
                self.isOffline = offline
                if reconnected { self.requestSafeRefresh() }
            }
        }
        monitor.start(queue: monitorQueue)
        self.monitor = monitor
    }

    deinit { monitor?.cancel() }

    func attach(to controller: WatchifyWebContainerController) -> WKWebView {
        container = controller
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.limitsNavigationsToAppBoundDomains = true
        configuration.defaultWebpagePreferences.preferredContentMode = .mobile
        configuration.preferences.javaScriptCanOpenWindowsAutomatically = false
        configuration.mediaTypesRequiringUserActionForPlayback = .all
        configuration.userContentController.addScriptMessageHandler(self, contentWorld: .page, name: "watchifyDownload")
        configuration.userContentController.addScriptMessageHandler(self, contentWorld: .page, name: "watchifyAccountRecovery")
        let view = WKWebView(frame: .zero, configuration: configuration)
        view.navigationDelegate = self
        view.uiDelegate = self
        view.isOpaque = false
        view.backgroundColor = UIColor(red: 16 / 255, green: 18 / 255, blue: 17 / 255, alpha: 1)
        view.scrollView.backgroundColor = view.backgroundColor
        view.scrollView.contentInsetAdjustmentBehavior = .never
        view.scrollView.keyboardDismissMode = .interactive
        // A back-swipe can expose a cached document snapshot before account
        // guards run. The shared app already provides its own hash navigation.
        view.allowsBackForwardNavigationGestures = false
        view.allowsLinkPreview = false
        view.isInspectable = false
        webView = view
        return view
    }

    func detach() {
        contextGeneration = UUID()
        invalidatePresentations()
        navigationTimeout?.cancel()
        webView?.stopLoading()
        webView?.configuration.userContentController.removeAllScriptMessageHandlers()
        webView?.navigationDelegate = nil
        webView?.uiDelegate = nil
        webView = nil
        container = nil
        monitor?.cancel()
        monitor = nil
    }

    func openInitialPage() {
        failure = nil
        webView?.load(URLRequest(url: WatchifyNavigationPolicy.homeURL, cachePolicy: .useProtocolCachePolicy, timeoutInterval: 30))
    }

    func retry() {
        // Retry is an explicit action. Process termination and reconnection do
        // not automatically replace a workspace containing unfinished edits.
        guard failure != nil else { return }
        notice = nil
        hasContent = false
        openInitialPage()
    }

    func clearNotice() { notice = nil }

    func handleScenePhase(_ phase: ScenePhase) {
        sceneActive = phase == .active
        showsPrivacyShield = phase != .active
        if phase == .active {
            recoveryOpening = false
            requestSafeRefresh()
        }
    }

    private func requestSafeRefresh() {
        guard sceneActive, hasContent, failure == nil, let webView,
              WatchifyNavigationPolicy.isTrusted(webView.url) else { return }
        // A fixed event asks the shared sync layer to check for changes. It
        // never reloads the page or reads account data into the native layer.
        webView.evaluateJavaScript("window.dispatchEvent(new Event('watchify:native-active'));", completionHandler: nil)
    }

    private func trusted(_ frame: WKFrameInfo, webView: WKWebView) -> Bool {
        let origin = frame.securityOrigin
        return WatchifyNavigationPolicy.isTrustedOrigin(scheme: origin.`protocol`, host: origin.host, port: origin.port, mainFrame: frame.isMainFrame)
            && WatchifyNavigationPolicy.isTrusted(frame.request.url)
            && WatchifyNavigationPolicy.isTrusted(webView.url)
    }

    private func presenter() -> UIViewController? {
        guard sceneActive, UIApplication.shared.applicationState == .active,
              let container, container.viewIfLoaded?.window != nil else { return nil }
        var root: UIViewController = container
        while let parent = root.parent { root = parent }
        guard root.presentedViewController == nil, !root.isBeingDismissed,
              !root.isBeingPresented, activeExport == nil,
              pendingDialog == nil, pendingRecovery == nil,
              !recoveryOpening else { return nil }
        return root
    }

    private func failedNavigation(_ error: Error) {
        let nsError = error as NSError
        if nsError.domain == NSURLErrorDomain && nsError.code == NSURLErrorCancelled { return }
        navigationTimeout?.cancel()
        if hasContent {
            notice = "That page could not open. Your current view remains available; check the cloud-save status before leaving."
        } else {
            let connectionCodes = [NSURLErrorNotConnectedToInternet, NSURLErrorNetworkConnectionLost, NSURLErrorTimedOut, NSURLErrorCannotFindHost, NSURLErrorCannotConnectToHost]
            failure = isOffline || (nsError.domain == NSURLErrorDomain && connectionCodes.contains(nsError.code)) ? .connection : .unavailable
        }
    }

    private func reject(_ reply: Reply, code: String, message: String, requestID: UUID? = nil) {
        var result: [String: Any] = ["ok": false, "code": code, "message": message]
        if let requestID { result["requestId"] = requestID.uuidString }
        reply(result, nil)
    }

    private func cancelExport(requestID: UUID? = nil) {
        guard let record = activeExport, requestID == nil || record.requestID == requestID else { return }
        activeExport = nil
        record.controller.completionWithItemsHandler = nil
        record.controller.dismiss(animated: false)
        try? FileManager.default.removeItem(at: record.directory)
        record.reply(["ok": false, "cancelled": true, "code": "DOWNLOAD_CANCELLED", "requestId": record.requestID.uuidString], nil)
    }

    private func invalidatePresentations() {
        cancelExport()
        if let dialog = pendingDialog {
            pendingDialog = nil
            dialog.controller.dismiss(animated: false)
            dialog.cancel()
        }
        browserController?.dismiss(animated: false)
        browserController = nil
        if let recovery = pendingRecovery {
            pendingRecovery = nil
            recoveryOpening = false
            recovery.reply(["ok": false, "code": "RECOVERY_CANCELLED"], nil)
        }
    }

    private func share(_ request: NativeDownloadRequest, reply: @escaping Reply) {
        guard !seenDownloadIDs.contains(request.requestID) else {
            reject(reply, code: "DOWNLOAD_DUPLICATE", message: "This export request has already been handled.", requestID: request.requestID)
            return
        }
        guard let presenter = presenter() else {
            reject(reply, code: "DOWNLOAD_BUSY", message: "Close the current iPhone dialog before sharing another file.", requestID: request.requestID)
            return
        }
        let directory = exportsDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        let file = directory.appendingPathComponent(request.filename, isDirectory: false)
        do {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true, attributes: [.protectionKey: FileProtectionType.complete])
            try request.bytes.write(to: file, options: [.atomic, .completeFileProtection])
        } catch {
            try? FileManager.default.removeItem(at: directory)
            reject(reply, code: "DOWNLOAD_WRITE", message: "The iPhone could not prepare this file. Check the available storage and try again.", requestID: request.requestID)
            return
        }
        seenDownloadIDs.insert(request.requestID)
        downloadOrder.append(request.requestID)
        if downloadOrder.count > 128 { seenDownloadIDs.remove(downloadOrder.removeFirst()) }

        let activity = UIActivityViewController(activityItems: [file], applicationActivities: nil)
        if request.mimeType == "application/json" {
            // Recovery needs an actual reusable copy. A clipboard reference to
            // our temporary file or a printed page is not a workspace backup.
            activity.excludedActivityTypes = [.copyToPasteboard, .print, .assignToContact, .addToReadingList]
        }
        if let popover = activity.popoverPresentationController {
            popover.sourceView = presenter.view
            popover.sourceRect = CGRect(x: presenter.view.bounds.midX, y: presenter.view.bounds.maxY - 24, width: 1, height: 1)
            popover.permittedArrowDirections = []
        }
        let record = ActiveExport(requestID: request.requestID, generation: contextGeneration, directory: directory, controller: activity, reply: reply)
        activeExport = record
        let requestID = request.requestID
        activity.completionWithItemsHandler = { [weak self] _, completed, _, error in
            let failed = error != nil
            Task { @MainActor [weak self] in
                self?.finishExport(requestID: requestID, completed: completed, failed: failed)
            }
        }
        presenter.present(activity, animated: true) { [weak self] in
            guard let self, self.activeExport === record else { return }
            record.presented = true
        }
    }

    private func finishExport(requestID: UUID, completed: Bool, failed: Bool) {
        guard let record = activeExport, record.requestID == requestID else { return }
        activeExport = nil
        try? FileManager.default.removeItem(at: record.directory)
        let currentContext = contextGeneration == record.generation && WatchifyNavigationPolicy.isTrusted(webView?.url)
        if completed && !failed && record.presented && currentContext {
            record.reply(["ok": true, "completed": true, "requestId": requestID.uuidString], nil)
        } else if failed && currentContext {
            reject(record.reply, code: "DOWNLOAD_FAILED", message: "The iPhone could not finish sharing this file. Your collection has not been replaced.", requestID: requestID)
        } else {
            record.reply(["ok": false, "cancelled": true, "code": "DOWNLOAD_CANCELLED", "requestId": requestID.uuidString], nil)
        }
    }

    private func openRecovery(reply: @escaping Reply) {
        guard presenter() != nil else {
            reject(reply, code: "RECOVERY_BUSY", message: "Close the current iPhone dialog, then try password recovery again.")
            return
        }
        recoveryOpening = true
        let id = UUID()
        pendingRecovery = PendingRecovery(id: id, generation: contextGeneration, reply: reply)
        UIApplication.shared.open(WatchifyNavigationPolicy.recoveryURL, options: [:]) { [weak self] opened in
            Task { @MainActor [weak self] in
                guard let self, let record = self.pendingRecovery, record.id == id else { return }
                self.pendingRecovery = nil
                guard self.contextGeneration == record.generation else {
                    record.reply(["ok": false, "code": "RECOVERY_CANCELLED"], nil)
                    return
                }
                if opened { record.reply(["ok": true, "opened": true], nil) }
                else {
                    self.recoveryOpening = false
                    self.reject(record.reply, code: "RECOVERY_OPEN_FAILED", message: "The iPhone could not open the browser. Open Watchify in your browser to reset your password.")
                }
            }
        }
    }
}

extension WatchifyWebSession: WKNavigationDelegate {
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping @MainActor @Sendable (WKNavigationActionPolicy) -> Void) {
        guard action.targetFrame?.isMainFrame != false else { decisionHandler(.cancel); return }
        let explicitLink = action.navigationType == .linkActivated && trusted(action.sourceFrame, webView: webView)
        switch WatchifyNavigationPolicy.destination(for: action.request.url, explicitLink: explicitLink) {
        case .watchify:
            if action.targetFrame == nil {
                decisionHandler(.cancel)
                if explicitLink { webView.load(action.request) }
            } else if action.shouldPerformDownload {
                decisionHandler(.cancel)
                notice = "Use Watchify’s export button to save or share this file."
            } else { decisionHandler(.allow) }
        case .externalBrowser:
            decisionHandler(.cancel)
            guard let url = action.request.url, let presenter = presenter() else { return }
            let browser = SFSafariViewController(url: url)
            browser.preferredControlTintColor = UIColor(red: 199 / 255, green: 170 / 255, blue: 118 / 255, alpha: 1)
            browserController = browser
            presenter.present(browser, animated: true)
        case .blocked:
            decisionHandler(.cancel)
            if explicitLink { notice = "This link is not an approved Watchify destination." }
            else if !hasContent {
                navigationTimeout?.cancel()
                failure = .unavailable
            }
        }
    }

    func webView(_ webView: WKWebView, decidePolicyFor response: WKNavigationResponse, decisionHandler: @escaping @MainActor @Sendable (WKNavigationResponsePolicy) -> Void) {
        guard response.isForMainFrame, WatchifyNavigationPolicy.isTrusted(response.response.url), response.canShowMIMEType else {
            decisionHandler(.cancel)
            return
        }
        if let http = response.response as? HTTPURLResponse, !(200..<400).contains(http.statusCode) {
            decisionHandler(.cancel)
            navigationTimeout?.cancel()
            if hasContent { notice = "Watchify could not open that page. Your current view remains available." }
            else { failure = .unavailable }
            return
        }
        decisionHandler(.allow)
    }

    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        contextGeneration = UUID()
        invalidatePresentations()
        failure = nil
        navigationTimeout?.cancel()
        let generation = contextGeneration
        navigationTimeout = Task { @MainActor [weak self] in
            do { try await Task.sleep(nanoseconds: 35_000_000_000) } catch { return }
            guard let self, self.contextGeneration == generation else { return }
            self.webView?.stopLoading()
            self.failedNavigation(URLError(.timedOut))
        }
    }

    func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) {
        hasContent = false
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        navigationTimeout?.cancel()
        guard WatchifyNavigationPolicy.isTrusted(webView.url) else { failure = .unavailable; return }
        failure = nil
        hasContent = true
        notice = nil
        requestSafeRefresh()
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        failedNavigation(error)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        failedNavigation(error)
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        contextGeneration = UUID()
        navigationTimeout?.cancel()
        invalidatePresentations()
        hasContent = false
        failure = .interrupted
    }
}

extension WatchifyWebSession: WKScriptMessageHandlerWithReply {
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage, replyHandler: @escaping @MainActor @Sendable (Any?, String?) -> Void) {
        guard let webView, message.webView === webView, trusted(message.frameInfo, webView: webView) else {
            reject(replyHandler, code: "NATIVE_ORIGIN", message: "This native action is only available inside Watchify.")
            return
        }
        if message.name == "watchifyAccountRecovery" {
            guard NativeAccountRecoveryPolicy.accepts(message.body) else {
                reject(replyHandler, code: "RECOVERY_INVALID", message: "Watchify could not recognise this recovery request.")
                return
            }
            openRecovery(reply: replyHandler)
            return
        }
        guard message.name == "watchifyDownload" else {
            reject(replyHandler, code: "NATIVE_INVALID", message: "This native action is unavailable.")
            return
        }
        do {
            switch try NativeDownloadPolicy.decode(message.body) {
            case .cancel(let id):
                if let id { cancelExport(requestID: id) }
                else {
                    contextGeneration = UUID()
                    invalidatePresentations()
                }
                replyHandler(["ok": true, "cancelled": true], nil)
            case .download(let request): share(request, reply: replyHandler)
            }
        } catch let error as NativeDownloadValidationError {
            reject(replyHandler, code: error.code, message: error.message)
        } catch {
            reject(replyHandler, code: "DOWNLOAD_INVALID", message: "Watchify could not prepare this export.")
        }
    }
}

extension WatchifyWebSession: WKUIDelegate {
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        // Approved explicit links are handled by the navigation policy. Never
        // create an unguarded second WKWebView for window.open or target=_blank.
        if navigationAction.targetFrame == nil,
           navigationAction.navigationType == .linkActivated,
           trusted(navigationAction.sourceFrame, webView: webView),
           WatchifyNavigationPolicy.isTrusted(navigationAction.request.url) {
            webView.load(navigationAction.request)
        }
        return nil
    }

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping @MainActor @Sendable () -> Void) {
        guard trusted(frame, webView: webView), let presenter = presenter() else { completionHandler(); return }
        let id = UUID()
        let alert = UIAlertController(title: "Watchify", message: String(message.prefix(1600)), preferredStyle: .alert)
        pendingDialog = PendingDialog(id: id, controller: alert, cancel: completionHandler)
        alert.addAction(UIAlertAction(title: "OK", style: .default) { [weak self] _ in
            guard let self, self.pendingDialog?.id == id else { return }
            self.pendingDialog = nil
            completionHandler()
        })
        presenter.present(alert, animated: true)
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping @MainActor @Sendable (Bool) -> Void) {
        guard trusted(frame, webView: webView), let presenter = presenter() else { completionHandler(false); return }
        let id = UUID()
        let alert = UIAlertController(title: "Watchify", message: String(message.prefix(1600)), preferredStyle: .alert)
        pendingDialog = PendingDialog(id: id, controller: alert, cancel: { completionHandler(false) })
        alert.addAction(UIAlertAction(title: "Cancel", style: .cancel) { [weak self] _ in
            guard let self, self.pendingDialog?.id == id else { return }
            self.pendingDialog = nil
            completionHandler(false)
        })
        alert.addAction(UIAlertAction(title: "Continue", style: .default) { [weak self] _ in
            guard let self, self.pendingDialog?.id == id else { return }
            self.pendingDialog = nil
            completionHandler(true)
        })
        presenter.present(alert, animated: true)
    }

    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String, defaultText: String?, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping @MainActor @Sendable (String?) -> Void) {
        // Watchify's forms live in the trusted page. It does not use native JS
        // prompts to collect passwords, recovery codes or other free-form data.
        completionHandler(nil)
    }
}
