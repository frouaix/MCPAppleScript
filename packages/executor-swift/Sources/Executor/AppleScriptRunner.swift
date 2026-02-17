import Foundation

/// Executes AppleScript using NSAppleScript and returns structured results.
enum AppleScriptRunner {
    /// Executes a raw AppleScript string and returns the result as a dictionary.
    static func execute(script: String) throws -> [String: Any] {
        var errorInfo: NSDictionary?
        let appleScript = NSAppleScript(source: script)

        guard let appleScript else {
            throw ExecutorError.scriptError("Failed to create NSAppleScript instance", details: nil)
        }

        let result = appleScript.executeAndReturnError(&errorInfo)

        if let errorInfo {
            throw ExecutorError.fromAppleScriptError(errorInfo)
        }

        return descriptorToDict(result)
    }

    /// Builds a script from a template ID and parameters, then executes it.
    static func executeTemplate(templateId: String, bundleId: String, parameters: [String: Any]) throws -> [String: Any] {
        let script = try buildTemplateScript(templateId: templateId, bundleId: bundleId, parameters: parameters)
        return try execute(script: script)
    }

    /// Converts an NSAppleEventDescriptor to a Swift dictionary representation.
    private static func descriptorToDict(_ descriptor: NSAppleEventDescriptor) -> [String: Any] {
        var result: [String: Any] = [:]

        // Try to extract a string value
        if let stringValue = descriptor.stringValue {
            result["value"] = stringValue
        }

        // Try to extract an integer value
        let intValue = descriptor.int32Value
        if intValue != 0 || descriptor.stringValue == nil {
            result["intValue"] = intValue
        }

        // Try to extract list items
        let count = descriptor.numberOfItems
        if count > 0 {
            var items: [Any] = []
            for i in 1...count {
                if let item = descriptor.atIndex(i) {
                    if let str = item.stringValue {
                        items.append(str)
                    } else {
                        items.append(descriptorToDict(item))
                    }
                }
            }
            result["items"] = items
        }

        if result.isEmpty {
            result["value"] = descriptor.stringValue ?? ""
        }

        return result
    }

    /// Builds an AppleScript string from a template identifier and parameters (public for dryRun).
    static func buildScript(templateId: String, bundleId: String, parameters: [String: Any]) throws -> String {
        return try buildTemplateScript(templateId: templateId, bundleId: bundleId, parameters: parameters)
    }

    /// Builds an AppleScript string from a template identifier and parameters.
    /// Dispatches to per-app template modules based on the template ID prefix.
    private static func buildTemplateScript(templateId: String, bundleId: String, parameters: [String: Any]) throws -> String {
        let prefix = templateId.split(separator: ".").first.map(String.init) ?? ""
        switch prefix {
        case "notes":
            return try NotesTemplates.build(templateId: templateId, bundleId: bundleId, parameters: parameters)
        case "calendar":
            return try CalendarTemplates.build(templateId: templateId, bundleId: bundleId, parameters: parameters)
        case "reminders":
            return try RemindersTemplates.build(templateId: templateId, bundleId: bundleId, parameters: parameters)
        case "mail":
            return try MailTemplates.build(templateId: templateId, bundleId: bundleId, parameters: parameters)
        case "contacts":
            return try ContactsTemplates.build(templateId: templateId, bundleId: bundleId, parameters: parameters)
        case "messages":
            return try MessagesTemplates.build(templateId: templateId, bundleId: bundleId, parameters: parameters)
        default:
            throw ExecutorError.invalidRequest("Unknown template prefix: \(prefix) (template: \(templateId))")
        }
    }
}
