import Foundation

/// Error types for the executor, mapped to stable error codes.
enum ExecutorError: Error {
    case automationDenied(String, osStatus: Int?)
    case appNotRunning(String)
    case scriptError(String, details: [String: String]?)
    case timeout(String)
    case invalidRequest(String)
    case internalError(String)

    var code: String {
        switch self {
        case .automationDenied: return "AUTOMATION_DENIED"
        case .appNotRunning: return "APP_NOT_RUNNING"
        case .scriptError: return "SCRIPT_ERROR"
        case .timeout: return "TIMEOUT"
        case .invalidRequest: return "INVALID_REQUEST"
        case .internalError: return "INTERNAL"
        }
    }

    var message: String {
        switch self {
        case .automationDenied(let msg, _): return msg
        case .appNotRunning(let msg): return msg
        case .scriptError(let msg, _): return msg
        case .timeout(let msg): return msg
        case .invalidRequest(let msg): return msg
        case .internalError(let msg): return msg
        }
    }

    var details: [String: String]? {
        switch self {
        case .automationDenied(_, let osStatus):
            if let status = osStatus {
                return ["osStatus": String(status)]
            }
            return nil
        case .scriptError(_, let details):
            return details
        default:
            return nil
        }
    }

    /// Maps an NSAppleScript error dictionary to an ExecutorError.
    static func fromAppleScriptError(_ errorInfo: NSDictionary) -> ExecutorError {
        let errorNumber = errorInfo[NSAppleScript.errorNumber] as? Int ?? 0
        let errorMessage = errorInfo[NSAppleScript.errorMessage] as? String ?? "Unknown AppleScript error"

        // -1743: Not authorized (TCC / automation permission)
        if errorNumber == -1743 {
            return .automationDenied(errorMessage, osStatus: errorNumber)
        }

        // -600: Application not running
        // -10810: Cannot find app
        if errorNumber == -600 || errorNumber == -10810 {
            return .appNotRunning(errorMessage)
        }

        return .scriptError(errorMessage, details: [
            "errorNumber": String(errorNumber),
        ])
    }
}
