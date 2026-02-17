import Foundation

/// JSON I/O utilities for reading requests from stdin and writing responses to stdout.
enum JsonIO {
    /// Reads all data from stdin and decodes it as the specified type.
    static func readRequest<T: Decodable>(_ type: T.Type) throws -> T {
        let data = FileHandle.standardInput.readDataToEndOfFile()
        guard !data.isEmpty else {
            throw ExecutorError.invalidRequest("Empty stdin: no request data received")
        }
        do {
            return try JSONDecoder().decode(type, from: data)
        } catch {
            throw ExecutorError.invalidRequest("Failed to parse request JSON: \(error.localizedDescription)")
        }
    }

    /// Encodes the given value as JSON and writes it to stdout.
    static func writeResponse<T: Encodable>(_ value: T) throws {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        let data = try encoder.encode(value)
        FileHandle.standardOutput.write(data)
    }

    /// Writes an error response to stdout.
    static func writeError(requestId: String, error: ExecutorError) {
        let response = ExecutorErrorResponse(
            requestId: requestId,
            error: ErrorDetail(
                code: error.code,
                message: error.message,
                details: error.details
            )
        )
        do {
            try writeResponse(response)
        } catch {
            // Last resort: write raw JSON to stderr
            let fallback = "{\"requestId\":\"\(requestId)\",\"ok\":false,\"error\":{\"code\":\"INTERNAL\",\"message\":\"Failed to encode error response\"}}"
            FileHandle.standardError.write(Data(fallback.utf8))
        }
    }
}
