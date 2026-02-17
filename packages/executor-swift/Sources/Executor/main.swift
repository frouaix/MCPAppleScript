import Foundation

// MARK: - Request/Response Models

struct ExecutorRequest: Codable {
    let requestId: String
    let bundleId: String
    let mode: String  // "template" or "raw"
    let templateId: String?
    let script: String?
    let parameters: [String: AnyCodable]
    let timeoutMs: Int
}

struct ExecutorSuccessResponse: Codable {
    let requestId: String
    let ok: Bool
    let result: [String: AnyCodable]
    let stdout: String
    let stderr: String

    init(requestId: String, result: [String: AnyCodable], stdout: String, stderr: String) {
        self.requestId = requestId
        self.ok = true
        self.result = result
        self.stdout = stdout
        self.stderr = stderr
    }
}

struct ExecutorErrorResponse: Codable {
    let requestId: String
    let ok: Bool
    let error: ErrorDetail

    init(requestId: String, error: ErrorDetail) {
        self.requestId = requestId
        self.ok = false
        self.error = error
    }
}

struct ErrorDetail: Codable {
    let code: String
    let message: String
    let details: [String: String]?
}

/// Type-erased Codable wrapper for heterogeneous JSON values.
struct AnyCodable: Codable, @unchecked Sendable {
    let value: Any

    init(_ value: Any) {
        self.value = value
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let str = try? container.decode(String.self) {
            value = str
        } else if let int = try? container.decode(Int.self) {
            value = int
        } else if let double = try? container.decode(Double.self) {
            value = double
        } else if let bool = try? container.decode(Bool.self) {
            value = bool
        } else if let dict = try? container.decode([String: AnyCodable].self) {
            value = dict.mapValues { $0.value }
        } else if let arr = try? container.decode([AnyCodable].self) {
            value = arr.map { $0.value }
        } else if container.decodeNil() {
            value = NSNull()
        } else {
            throw DecodingError.typeMismatch(AnyCodable.self, .init(codingPath: decoder.codingPath, debugDescription: "Unsupported type"))
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch value {
        case let str as String:
            try container.encode(str)
        case let int as Int:
            try container.encode(int)
        case let double as Double:
            try container.encode(double)
        case let bool as Bool:
            try container.encode(bool)
        case let dict as [String: Any]:
            try container.encode(dict.mapValues { AnyCodable($0) })
        case let arr as [Any]:
            try container.encode(arr.map { AnyCodable($0) })
        case is NSNull:
            try container.encodeNil()
        default:
            try container.encode(String(describing: value))
        }
    }
}

// MARK: - Logging

func log(_ message: String) {
    FileHandle.standardError.write(Data("[executor] \(message)\n".utf8))
}

// MARK: - Main Entry Point

struct Executor {
    static func main() {
        log("AppleScript Executor v0.1.0")

        var requestId = "unknown"

        do {
            let request = try JsonIO.readRequest(ExecutorRequest.self)
            requestId = request.requestId
            log("Received request \(requestId) mode=\(request.mode) bundleId=\(request.bundleId)")

            // Validate bundle ID
            guard AppTargeting.validateBundleId(request.bundleId) else {
                throw ExecutorError.invalidRequest("Invalid bundle ID format: \(request.bundleId)")
            }

            let result: [String: Any]

            switch request.mode {
            case "template":
                guard let templateId = request.templateId else {
                    throw ExecutorError.invalidRequest("Template mode requires 'templateId'")
                }
                let params = request.parameters.mapValues { $0.value }
                result = try AppleScriptRunner.executeTemplate(
                    templateId: templateId,
                    bundleId: request.bundleId,
                    parameters: params
                )

            case "raw":
                guard let script = request.script else {
                    throw ExecutorError.invalidRequest("Raw mode requires 'script'")
                }
                result = try AppleScriptRunner.execute(script: script)

            default:
                throw ExecutorError.invalidRequest("Unknown mode: \(request.mode)")
            }

            let response = ExecutorSuccessResponse(
                requestId: requestId,
                result: result.mapValues { AnyCodable($0) },
                stdout: "",
                stderr: ""
            )
            try JsonIO.writeResponse(response)
            log("Request \(requestId) completed successfully")

        } catch let error as ExecutorError {
            log("Request \(requestId) failed: \(error.code) - \(error.message)")
            JsonIO.writeError(requestId: requestId, error: error)

        } catch {
            log("Request \(requestId) unexpected error: \(error)")
            JsonIO.writeError(
                requestId: requestId,
                error: .internalError("Unexpected error: \(error.localizedDescription)")
            )
        }
    }
}

Executor.main()
