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
    private static func buildTemplateScript(templateId: String, bundleId: String, parameters: [String: Any]) throws -> String {
        switch templateId {
        case "notes.create_note.v1":
            return try buildNotesCreateScript(bundleId: bundleId, parameters: parameters)
        case "calendar.create_event.v1":
            return try buildCalendarCreateScript(bundleId: bundleId, parameters: parameters)
        case "mail.compose_draft.v1":
            return try buildMailComposeScript(bundleId: bundleId, parameters: parameters)
        default:
            throw ExecutorError.invalidRequest("Unknown template: \(templateId)")
        }
    }

    // MARK: - Template Builders

    private static func buildNotesCreateScript(bundleId: String, parameters: [String: Any]) throws -> String {
        let title = escapeAppleScript(parameters["title"] as? String ?? "Untitled")
        let body = escapeAppleScript(parameters["body"] as? String ?? "")

        return """
        tell application id "\(bundleId)"
            activate
            set newNote to make new note with properties {name:"\(title)", body:"\(body)"}
            return name of newNote
        end tell
        """
    }

    private static func buildCalendarCreateScript(bundleId: String, parameters: [String: Any]) throws -> String {
        guard let title = parameters["title"] as? String else {
            throw ExecutorError.invalidRequest("calendar.create_event requires 'title' parameter")
        }
        guard let startStr = parameters["start"] as? String else {
            throw ExecutorError.invalidRequest("calendar.create_event requires 'start' parameter")
        }
        guard let endStr = parameters["end"] as? String else {
            throw ExecutorError.invalidRequest("calendar.create_event requires 'end' parameter")
        }
        let calendarName = escapeAppleScript(parameters["calendarName"] as? String ?? "Calendar")
        let location = escapeAppleScript(parameters["location"] as? String ?? "")
        let notes = escapeAppleScript(parameters["notes"] as? String ?? "")

        return """
        tell application id "\(bundleId)"
            set targetCalendar to first calendar whose name is "\(calendarName)"
            set startDate to date "\(escapeAppleScript(startStr))"
            set endDate to date "\(escapeAppleScript(endStr))"
            set newEvent to make new event at end of events of targetCalendar with properties {summary:"\(escapeAppleScript(title))", start date:startDate, end date:endDate, location:"\(location)", description:"\(notes)"}
            return uid of newEvent
        end tell
        """
    }

    private static func buildMailComposeScript(bundleId: String, parameters: [String: Any]) throws -> String {
        guard let to = parameters["to"] as? String else {
            throw ExecutorError.invalidRequest("mail.compose_draft requires 'to' parameter")
        }
        let subject = escapeAppleScript(parameters["subject"] as? String ?? "")
        let body = escapeAppleScript(parameters["body"] as? String ?? "")

        return """
        tell application id "\(bundleId)"
            set newMessage to make new outgoing message with properties {subject:"\(subject)", content:"\(body)", visible:true}
            tell newMessage
                make new to recipient at end of to recipients with properties {address:"\(escapeAppleScript(to))"}
            end tell
            return subject of newMessage
        end tell
        """
    }

    /// Escapes special characters for safe use in AppleScript strings.
    private static func escapeAppleScript(_ input: String) -> String {
        return input
            .replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "\"", with: "\\\"")
    }
}
