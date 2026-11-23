import SwiftUI
import UIKit
import WebKit

@MainActor
struct WatchifyWebView: UIViewControllerRepresentable {
    @ObservedObject var session: WatchifyWebSession

    func makeUIViewController(context: Context) -> WatchifyWebContainerController {
        WatchifyWebContainerController(session: session)
    }

    func updateUIViewController(_ controller: WatchifyWebContainerController, context: Context) {
        // A SwiftUI redraw must not reload the page or discard a form draft.
    }

    static func dismantleUIViewController(_ controller: WatchifyWebContainerController, coordinator: ()) {
        controller.session.detach()
    }
}

@MainActor
final class WatchifyWebContainerController: UIViewController {
    let session: WatchifyWebSession

    init(session: WatchifyWebSession) {
        self.session = session
        super.init(nibName: nil, bundle: nil)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("Watchify uses a programmatic view controller.") }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 16 / 255, green: 18 / 255, blue: 17 / 255, alpha: 1)
        let webView = session.attach(to: self)
        webView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(webView)
        NSLayoutConstraint.activate([
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            webView.topAnchor.constraint(equalTo: view.topAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        ])
        session.openInitialPage()
    }

    override var preferredStatusBarStyle: UIStatusBarStyle { .lightContent }
}
