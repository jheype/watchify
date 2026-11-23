import Foundation
import CoreFoundation

struct NativeDownloadRequest: Sendable {
    let requestID: UUID
    let filename: String
    let mimeType: String
    let bytes: Data
}

enum NativeDownloadCommand: Sendable {
    case download(NativeDownloadRequest)
    case cancel(UUID?)
}

enum NativeDownloadValidationError: Error, Equatable, Sendable {
    case invalidMessage
    case invalidFilename
    case unsupportedType
    case tooLarge
    case invalidData

    var code: String {
        switch self {
        case .invalidMessage: return "DOWNLOAD_INVALID"
        case .invalidFilename: return "DOWNLOAD_FILENAME"
        case .unsupportedType: return "DOWNLOAD_TYPE"
        case .tooLarge: return "DOWNLOAD_TOO_LARGE"
        case .invalidData: return "DOWNLOAD_DATA"
        }
    }

    var message: String {
        switch self {
        case .invalidMessage: return "Watchify could not recognise this export request."
        case .invalidFilename: return "The export filename is not supported."
        case .unsupportedType: return "This file type cannot be shared by Watchify."
        case .tooLarge: return "This export exceeds the supported file size."
        case .invalidData: return "This export is incomplete or has an unexpected format."
        }
    }
}

enum NativeDownloadPolicy {
    static let documentLimit = 8 * 1024 * 1024
    static let backupLimit = 32 * 1024 * 1024

    static func decode(_ raw: Any) throws -> NativeDownloadCommand {
        guard let body = raw as? [String: Any], isVersionOne(body["version"]),
              let type = body["type"] as? String else { throw NativeDownloadValidationError.invalidMessage }
        if type == "cancel" {
            guard Set(body.keys).isSubset(of: ["version", "type", "requestId"]) else {
                throw NativeDownloadValidationError.invalidMessage
            }
            if body["requestId"] == nil || body["requestId"] is NSNull { return .cancel(nil) }
            return .cancel(try requestID(body["requestId"]))
        }
        guard type == "download",
              Set(body.keys) == Set(["version", "type", "requestId", "filename", "mimeType", "base64"]),
              let filename = body["filename"] as? String,
              let mimeType = body["mimeType"] as? String,
              let base64 = body["base64"] as? String else { throw NativeDownloadValidationError.invalidMessage }
        let id = try requestID(body["requestId"])
        let suffix: String
        let byteLimit: Int
        switch mimeType {
        case "application/pdf": suffix = ".pdf"; byteLimit = documentLimit
        case "text/csv": suffix = ".csv"; byteLimit = documentLimit
        case "application/json": suffix = ".json"; byteLimit = backupLimit
        default: throw NativeDownloadValidationError.unsupportedType
        }
        guard validFilename(filename, suffix: suffix) else { throw NativeDownloadValidationError.invalidFilename }
        // Check the encoded bound before allocating decoded data. Only strict
        // base64 is accepted; whitespace and other ignored characters are not.
        let encodedLimit = ((byteLimit + 2) / 3) * 4
        guard base64.utf8.count <= encodedLimit else { throw NativeDownloadValidationError.tooLarge }
        guard !base64.isEmpty, base64.utf8.count.isMultiple(of: 4),
              let data = Data(base64Encoded: base64, options: []) else { throw NativeDownloadValidationError.invalidData }
        guard data.count <= byteLimit else { throw NativeDownloadValidationError.tooLarge }
        guard !data.isEmpty else { throw NativeDownloadValidationError.invalidData }
        switch mimeType {
        case "application/pdf":
            guard data.starts(with: Data("%PDF-".utf8)) else { throw NativeDownloadValidationError.invalidData }
        case "text/csv":
            guard let text = String(data: data, encoding: .utf8), !text.contains("\0") else {
                throw NativeDownloadValidationError.invalidData
            }
        case "application/json":
            guard String(data: data, encoding: .utf8) != nil,
                  let object = try? JSONSerialization.jsonObject(with: data),
                  let envelope = object as? [String: Any],
                  envelope["product"] as? String == "Watchify",
                  envelope["kind"] as? String == "test-workspace-backup",
                  envelope["snapshot"] is [String: Any],
                  let exportedAt = envelope["exportedAt"] as? String,
                  !exportedAt.isEmpty, exportedAt.utf8.count <= 64 else { throw NativeDownloadValidationError.invalidData }
        default: throw NativeDownloadValidationError.unsupportedType
        }
        return .download(NativeDownloadRequest(requestID: id, filename: filename, mimeType: mimeType, bytes: data))
    }

    static func validFilename(_ value: String, suffix: String) -> Bool {
        guard !value.isEmpty, value.utf8.count <= 128,
              value.hasSuffix(suffix), !value.hasPrefix("."), !value.contains(".."),
              value.count > suffix.count else { return false }
        return value.utf8.allSatisfy { byte in
            (byte >= 65 && byte <= 90) || (byte >= 97 && byte <= 122)
                || (byte >= 48 && byte <= 57) || [32, 45, 46, 95].contains(byte)
        }
    }

    static func isVersionOne(_ raw: Any?) -> Bool {
        guard let number = raw as? NSNumber, CFGetTypeID(number) != CFBooleanGetTypeID() else { return false }
        return number.doubleValue == 1
    }

    private static func requestID(_ raw: Any?) throws -> UUID {
        guard let string = raw as? String, string.utf8.count == 36, let id = UUID(uuidString: string) else {
            throw NativeDownloadValidationError.invalidMessage
        }
        return id
    }
}

enum NativeAccountRecoveryPolicy {
    static func accepts(_ raw: Any) -> Bool {
        guard let body = raw as? [String: Any], Set(body.keys) == Set(["version", "type"]) else { return false }
        return NativeDownloadPolicy.isVersionOne(body["version"]) && body["type"] as? String == "openRecovery"
    }
}
