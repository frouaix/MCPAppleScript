import Foundation

/// Shared AppleScript escape handlers and Swift-side JSON safety net.
enum JsonEscape {

    // MARK: - AppleScript Handlers

    /// AppleScript handlers that escape string values for safe JSON embedding.
    /// Appended to every template script by AppleScriptRunner.
    ///
    /// `jsonEsc(s)` escapes: \ → \\, " → \", CR → \n, LF → \n, tab → \t
    /// `replaceText(theString, old, new)` helper for text item delimiter-based replacement.
    static let handlers: String = #"""

on jsonEsc(s)
    set s to s as text
    set s to my replaceText(s, "\\", "\\\\")
    set s to my replaceText(s, "\"", "\\" & quote)
    set s to my replaceText(s, return, "\\n")
    set s to my replaceText(s, linefeed, "\\n")
    set s to my replaceText(s, tab, "\\t")
    return s
end jsonEsc

on replaceText(theString, old, new)
    set AppleScript's text item delimiters to old
    set theItems to every text item of theString
    set AppleScript's text item delimiters to new
    set theString to theItems as string
    set AppleScript's text item delimiters to ""
    return theString
end replaceText
"""#

    // MARK: - Script Wrapping

    /// Appends the jsonEsc handlers to a template script.
    static func wrapScript(_ script: String) -> String {
        script + handlers
    }

    // MARK: - Swift Safety Net

    /// Attempts to parse the executor result's "value" as JSON and re-serialize it.
    /// If the value is valid JSON, returns a dict with the parsed object under "value".
    /// If not JSON (or parse fails), returns the original dict unchanged.
    static func reserialize(_ result: [String: Any]) -> [String: Any] {
        guard let stringValue = result["value"] as? String,
              !stringValue.isEmpty,
              let firstChar = stringValue.first,
              (firstChar == "{" || firstChar == "[") else {
            return result
        }

        guard let data = stringValue.data(using: .utf8),
              let parsed = try? JSONSerialization.jsonObject(with: data, options: []) else {
            // JSON parse failed — return raw string; the MCP client will see the error
            return result
        }

        // Re-serialize to guarantee proper escaping
        if let reData = try? JSONSerialization.data(withJSONObject: parsed, options: [.sortedKeys]),
           let reString = String(data: reData, encoding: .utf8) {
            return ["value": reString]
        }

        return result
    }
}
