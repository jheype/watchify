import Foundation
import XCTest
@testable import Watchify

final class WatchifyNativePolicyTests: XCTestCase {
    private let id = "20988AED-1736-440A-9DFA-460D67C7A607"

    private func payload(filename: String = "watchify-valuation.pdf", mime: String = "application/pdf", data: Data = Data("%PDF-1.7\n%%EOF".utf8)) -> [String: Any] {
        ["version": 1, "type": "download", "requestId": id, "filename": filename, "mimeType": mime, "base64": data.base64EncodedString()]
    }

    private func backup() throws -> Data {
        try JSONSerialization.data(withJSONObject: [
            "product": "Watchify", "kind": "test-workspace-backup",
            "exportedAt": "2026-11-23T12:00:00.000Z", "snapshot": ["version": 1]
        ])
    }

    private func assertFailure(_ body: [String: Any], _ expected: NativeDownloadValidationError, file: StaticString = #filePath, line: UInt = #line) {
        XCTAssertThrowsError(try NativeDownloadPolicy.decode(body), file: file, line: line) { error in
            XCTAssertEqual(error as? NativeDownloadValidationError, expected, file: file, line: line)
        }
    }

    func testOnlyCanonicalHTTPSOriginCanOpenInsideTheApp() {
        for address in [
            "https://watchify-azure.vercel.app/",
            "https://watchify-azure.vercel.app:443/#analytics",
            "https://WATCHIFY-AZURE.VERCEL.APP/?code=example#account/security"
        ] {
            XCTAssertTrue(WatchifyNavigationPolicy.isTrusted(URL(string: address)), address)
        }
        for address in [
            "http://watchify-azure.vercel.app/",
            "https://watchify-azure.vercel.app:444/",
            "https://watchify-azure.vercel.app.evil.example/",
            "https://watchify-azure.vercel.app./",
            "https://watchify-azure.vercel.app@evil.example/",
            "https://name:password@watchify-azure.vercel.app/",
            "https://evil.example/?next=https://watchify-azure.vercel.app/",
            "https://watchify-jheypes-projects.vercel.app/",
            "file:///private/data.pdf", "data:text/html,hello",
            "javascript:alert(1)", "blob:https://watchify-azure.vercel.app/a"
        ] {
            XCTAssertFalse(WatchifyNavigationPolicy.isTrusted(URL(string: address)), address)
        }
        XCTAssertFalse(WatchifyNavigationPolicy.isTrusted(nil))
    }

    func testBridgeRejectsSubframesWrongSchemesAndPorts() {
        XCTAssertTrue(WatchifyNavigationPolicy.isTrustedOrigin(scheme: "https", host: "watchify-azure.vercel.app", port: 443, mainFrame: true))
        XCTAssertTrue(WatchifyNavigationPolicy.isTrustedOrigin(scheme: "https", host: "watchify-azure.vercel.app", port: 0, mainFrame: true))
        XCTAssertFalse(WatchifyNavigationPolicy.isTrustedOrigin(scheme: "https", host: "watchify-azure.vercel.app", port: 443, mainFrame: false))
        XCTAssertFalse(WatchifyNavigationPolicy.isTrustedOrigin(scheme: "http", host: "watchify-azure.vercel.app", port: 443, mainFrame: true))
        XCTAssertFalse(WatchifyNavigationPolicy.isTrustedOrigin(scheme: "https", host: "watchify-azure.vercel.app", port: 8443, mainFrame: true))
        XCTAssertFalse(WatchifyNavigationPolicy.isTrustedOrigin(scheme: "https", host: "watchify-azure.vercel.app.evil.example", port: 443, mainFrame: true))
    }

    func testExternalNavigationNeedsExplicitGestureAndApprovedDestination() {
        let project = URL(string: "https://github.com/jheype/watchify")!
        XCTAssertEqual(WatchifyNavigationPolicy.destination(for: project, explicitLink: true), .externalBrowser)
        XCTAssertEqual(WatchifyNavigationPolicy.destination(for: project, explicitLink: false), .blocked)
        for address in [
            "https://github.com/jheype/watchify-evil",
            "https://github.com/another/repository",
            "https://github.com/jheype/watchify?token=private",
            "https://github.com:444/jheype/watchify",
            "https://github.com@evil.example/jheype/watchify",
            "mailto:someone@example.com", "tel:123", "itms-services://download", "https://example.com"
        ] {
            XCTAssertEqual(WatchifyNavigationPolicy.destination(for: URL(string: address), explicitLink: true), .blocked, address)
        }
        XCTAssertEqual(WatchifyNavigationPolicy.destination(for: WatchifyNavigationPolicy.homeURL, explicitLink: false), .watchify)
    }

    func testValidPDFIsPreservedByteForByte() throws {
        let bytes = Data("%PDF-1.7\nknown document bytes\n%%EOF".utf8)
        guard case .download(let request) = try NativeDownloadPolicy.decode(payload(data: bytes)) else { return XCTFail("Expected download") }
        XCTAssertEqual(request.requestID, UUID(uuidString: id))
        XCTAssertEqual(request.bytes, bytes)
        XCTAssertEqual(request.filename, "watchify-valuation.pdf")
        XCTAssertEqual(request.mimeType, "application/pdf")
    }

    func testUTF8CSVAndWatchifyJSONBackupRemainExportable() throws {
        let csv = Data("\u{FEFF}Brand,Model\nCartier,José’s watch\n".utf8)
        guard case .download(let request) = try NativeDownloadPolicy.decode(payload(filename: "watchify-collection.csv", mime: "text/csv", data: csv)) else { return XCTFail("Expected CSV") }
        XCTAssertEqual(request.bytes, csv)
        let json = try backup()
        guard case .download(let backupRequest) = try NativeDownloadPolicy.decode(payload(filename: "watchify-test-workspace.json", mime: "application/json", data: json)) else { return XCTFail("Expected JSON") }
        XCTAssertEqual(backupRequest.bytes, json)
    }

    func testRejectsTraversalInvisibleNamesAndExtensionMismatch() {
        for name in ["../report.pdf", "../x/../report.pdf", "x\\report.pdf", "/report.pdf", ".report.pdf", "report\n.pdf", "report:one.pdf", "report.pdf.exe", "report..pdf", "José.pdf", "report.PDF", "a\0.pdf"] {
            assertFailure(payload(filename: name), .invalidFilename)
        }
        assertFailure(payload(filename: String(repeating: "a", count: 125) + ".pdf"), .invalidFilename)
        assertFailure(payload(filename: "report.csv"), .invalidFilename)
        assertFailure(payload(mime: "text/html"), .unsupportedType)
        assertFailure(payload(mime: "application/javascript"), .unsupportedType)
    }

    func testRejectsSchemaConfusionAndInvalidRequestIDs() {
        var body = payload()
        body["version"] = true
        assertFailure(body, .invalidMessage)
        body["version"] = 1.5
        assertFailure(body, .invalidMessage)
        body["version"] = "1"
        assertFailure(body, .invalidMessage)
        body = payload(); body["version"] = 2
        assertFailure(body, .invalidMessage)
        body = payload(); body["url"] = "file:///private/document"
        assertFailure(body, .invalidMessage)
        body = payload(); body["requestId"] = "../../other-request"
        assertFailure(body, .invalidMessage)
        body = payload(); body.removeValue(forKey: "requestId")
        assertFailure(body, .invalidMessage)
        body = payload(); body["type"] = "openURL"
        assertFailure(body, .invalidMessage)
    }

    func testRejectsInvalidBase64WrongSignaturesAndBinaryCSV() {
        for encoded in ["", "%%%/", "Zg", "JVBERi0=\n", "not-base64"] {
            var body = payload(); body["base64"] = encoded
            assertFailure(body, .invalidData)
        }
        assertFailure(payload(data: Data("<html>not a PDF</html>".utf8)), .invalidData)
        assertFailure(payload(filename: "file.csv", mime: "text/csv", data: Data([0xff, 0xfe])), .invalidData)
        assertFailure(payload(filename: "file.csv", mime: "text/csv", data: Data("a\0,b".utf8)), .invalidData)
    }

    func testRecoveryEnvelopeMustBelongToWatchify() {
        for json in [
            "{}", "[]", "null", "{broken}",
            "{\"product\":\"Other\",\"kind\":\"test-workspace-backup\",\"exportedAt\":\"now\",\"snapshot\":{}}",
            "{\"product\":\"Watchify\",\"kind\":\"credentials\",\"exportedAt\":\"now\",\"snapshot\":{}}",
            "{\"product\":\"Watchify\",\"kind\":\"test-workspace-backup\",\"exportedAt\":\"now\",\"snapshot\":[]}"
        ] {
            assertFailure(payload(filename: "watchify-test-workspace.json", mime: "application/json", data: Data(json.utf8)), .invalidData)
        }
    }

    func testDocumentLimitsAreEnforcedBeforeSharing() throws {
        let atLimit = Data("%PDF-".utf8) + Data(repeating: 65, count: NativeDownloadPolicy.documentLimit - 5)
        guard case .download(let accepted) = try NativeDownloadPolicy.decode(payload(data: atLimit)) else { return XCTFail("Expected boundary PDF") }
        XCTAssertEqual(accepted.bytes.count, NativeDownloadPolicy.documentLimit)
        assertFailure(payload(data: atLimit + Data([65])), .tooLarge)
        var oversized = payload()
        oversized["base64"] = String(repeating: "A", count: ((NativeDownloadPolicy.documentLimit + 2) / 3) * 4 + 4)
        assertFailure(oversized, .tooLarge)
        var backupTooLarge = payload(filename: "watchify-test-workspace.json", mime: "application/json")
        backupTooLarge["base64"] = String(repeating: "A", count: ((NativeDownloadPolicy.backupLimit + 2) / 3) * 4 + 4)
        assertFailure(backupTooLarge, .tooLarge)
    }

    func testCancellationCanTargetOneRequestOrTheCurrentDocument() throws {
        guard case .cancel(let allID) = try NativeDownloadPolicy.decode(["version": 1, "type": "cancel"]) else { return XCTFail("Expected cancellation") }
        XCTAssertNil(allID)
        guard case .cancel(let oneID) = try NativeDownloadPolicy.decode(["version": 1, "type": "cancel", "requestId": id]) else { return XCTFail("Expected targeted cancellation") }
        XCTAssertEqual(oneID, UUID(uuidString: id))
        assertFailure(["version": 1, "type": "cancel", "requestId": "bad"], .invalidMessage)
        assertFailure(["version": 1, "type": "cancel", "filename": "unexpected.pdf"], .invalidMessage)
    }

    func testRecoveryCannotCarryAnArbitraryURLOrAccountData() {
        XCTAssertTrue(NativeAccountRecoveryPolicy.accepts(["version": 1, "type": "openRecovery"]))
        XCTAssertFalse(NativeAccountRecoveryPolicy.accepts(["version": true, "type": "openRecovery"]))
        XCTAssertFalse(NativeAccountRecoveryPolicy.accepts(["version": 2, "type": "openRecovery"]))
        XCTAssertFalse(NativeAccountRecoveryPolicy.accepts(["version": 1, "type": "openRecovery", "url": "https://evil.example/"]))
        XCTAssertFalse(NativeAccountRecoveryPolicy.accepts(["version": 1, "type": "openRecovery", "email": "private@example.com"]))
        XCTAssertFalse(NativeAccountRecoveryPolicy.accepts(["version": 1, "type": "openRecovery", "token": "secret"]))
        XCTAssertEqual(WatchifyNavigationPolicy.recoveryURL.absoluteString, "https://watchify-azure.vercel.app/?watchify_access=reset")
    }
}
