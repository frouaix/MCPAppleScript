import Foundation

/// AppleScript templates for Apple Reminders.
enum RemindersTemplates {
    static func build(templateId: String, bundleId: String, parameters: [String: Any]) throws -> String {
        switch templateId {
        case "reminders.list_lists":
            return buildListLists(bundleId: bundleId)
        case "reminders.list_reminders":
            return buildListReminders(bundleId: bundleId, parameters: parameters)
        case "reminders.get_reminder":
            return try buildGetReminder(bundleId: bundleId, parameters: parameters)
        case "reminders.search_reminders":
            return try buildSearchReminders(bundleId: bundleId, parameters: parameters)
        case "reminders.create_reminder":
            return try buildCreateReminder(bundleId: bundleId, parameters: parameters)
        case "reminders.update_reminder":
            return try buildUpdateReminder(bundleId: bundleId, parameters: parameters)
        case "reminders.delete_reminder":
            return try buildDeleteReminder(bundleId: bundleId, parameters: parameters)
        case "reminders.show":
            return buildShow(bundleId: bundleId, parameters: parameters)
        case "reminders.complete":
            return try buildComplete(bundleId: bundleId, parameters: parameters)
        default:
            throw ExecutorError.invalidRequest("Unknown reminders template: \(templateId)")
        }
    }

    // MARK: - Readonly

    private static func buildListLists(bundleId: String) -> String {
        """
        tell application id "\(bundleId)"
            set listList to {}
            repeat with l in lists
                set end of listList to {listId:id of l, listName:name of l, listCount:(count of reminders of l)}
            end repeat
            set output to "["
            repeat with i from 1 to count of listList
                set l to item i of listList
                set output to output & "{\\"id\\":\\"" & my jsonEsc(listId of l) & "\\",\\"name\\":\\"" & my jsonEsc(listName of l) & "\\",\\"type\\":\\"list\\",\\"itemCount\\":" & (listCount of l as text) & "}"
                if i < (count of listList) then set output to output & ","
            end repeat
            set output to output & "]"
            return output
        end tell
        """
    }

    private static func buildListReminders(bundleId: String, parameters: [String: Any]) -> String {
        let listId = parameters["listId"] as? String ?? ""
        let limit = parameters["limit"] as? Int ?? 50
        let offset = parameters["offset"] as? Int ?? 0

        let targetClause: String
        if !listId.isEmpty {
            targetClause = "reminders of list id \"\(esc(listId))\""
        } else {
            targetClause = "reminders"
        }

        return """
        tell application id "\(bundleId)"
            set allReminders to \(targetClause)
            set totalCount to count of allReminders
            set startIdx to \(offset + 1)
            set endIdx to \(offset + limit)
            if endIdx > totalCount then set endIdx to totalCount
            set output to "{\\"total\\":" & (totalCount as text) & ",\\"items\\":["
            if startIdx ≤ totalCount then
                repeat with i from startIdx to endIdx
                    set r to item i of allReminders
                    set rId to id of r
                    set rName to name of r
                    set rCompleted to completed of r
                    set rDueDate to ""
                    try
                        set rDueDate to due date of r as «class isot» as string
                    end try
                    set output to output & "{\\"id\\":\\"" & my jsonEsc(rId) & "\\",\\"name\\":\\"" & my jsonEsc(rName) & "\\",\\"type\\":\\"reminder\\",\\"properties\\":{\\"completed\\":" & rCompleted & ",\\"dueDate\\":\\"" & my jsonEsc(rDueDate) & "\\"}}"
                    if i < endIdx then set output to output & ","
                end repeat
            end if
            set output to output & "]}"
            return output
        end tell
        """
    }

    private static func buildGetReminder(bundleId: String, parameters: [String: Any]) throws -> String {
        guard let reminderId = parameters["reminderId"] as? String, !reminderId.isEmpty else {
            throw ExecutorError.invalidRequest("reminders.get_reminder requires 'reminderId' parameter")
        }
        return """
        tell application id "\(bundleId)"
            set r to reminder id "\(esc(reminderId))"
            set rId to id of r
            set rName to name of r
            set rBody to body of r
            set rCompleted to completed of r
            set rPriority to priority of r
            set rFlagged to flagged of r
            set rCreated to creation date of r as «class isot» as string
            set rModified to modification date of r as «class isot» as string
            set cName to name of container of r
            set rDueDate to ""
            try
                set rDueDate to due date of r as «class isot» as string
            end try
            return "{\\"id\\":\\"" & my jsonEsc(rId) & "\\",\\"name\\":\\"" & my jsonEsc(rName) & "\\",\\"type\\":\\"reminder\\",\\"containerName\\":\\"" & my jsonEsc(cName) & "\\",\\"createdAt\\":\\"" & my jsonEsc(rCreated) & "\\",\\"modifiedAt\\":\\"" & my jsonEsc(rModified) & "\\",\\"properties\\":{\\"body\\":\\"" & my jsonEsc(rBody) & "\\",\\"completed\\":" & rCompleted & ",\\"priority\\":" & rPriority & ",\\"flagged\\":" & rFlagged & ",\\"dueDate\\":\\"" & my jsonEsc(rDueDate) & "\\"}}"
        end tell
        """
    }

    private static func buildSearchReminders(bundleId: String, parameters: [String: Any]) throws -> String {
        guard let query = parameters["query"] as? String, !query.isEmpty else {
            throw ExecutorError.invalidRequest("reminders.search_reminders requires 'query' parameter")
        }
        let limit = parameters["limit"] as? Int ?? 20

        return """
        tell application id "\(bundleId)"
            set matchingReminders to reminders whose name contains "\(esc(query))"
            set resultCount to count of matchingReminders
            if resultCount > \(limit) then set resultCount to \(limit)
            set output to "["
            repeat with i from 1 to resultCount
                set r to item i of matchingReminders
                set rId to id of r
                set rName to name of r
                set rCompleted to completed of r
                set output to output & "{\\"id\\":\\"" & my jsonEsc(rId) & "\\",\\"name\\":\\"" & my jsonEsc(rName) & "\\",\\"type\\":\\"reminder\\",\\"properties\\":{\\"completed\\":" & rCompleted & "}}"
                if i < resultCount then set output to output & ","
            end repeat
            set output to output & "]"
            return output
        end tell
        """
    }

    // MARK: - Create

    private static func buildCreateReminder(bundleId: String, parameters: [String: Any]) throws -> String {
        guard let name = parameters["name"] as? String, !name.isEmpty else {
            throw ExecutorError.invalidRequest("reminders.create_reminder requires 'name' parameter")
        }
        let listName = parameters["listName"] as? String ?? ""
        let body = esc(parameters["body"] as? String ?? "")
        let dueDate = parameters["dueDate"] as? String ?? ""
        let priority = parameters["priority"] as? Int ?? 0
        let flagged = parameters["flagged"] as? Bool ?? false

        var props = "name:\"\(esc(name))\""
        if !body.isEmpty { props += ", body:\"\(body)\"" }
        if priority > 0 { props += ", priority:\(priority)" }
        if flagged { props += ", flagged:true" }

        let targetClause: String
        if !listName.isEmpty {
            targetClause = "at end of reminders of list \"\(esc(listName))\""
        } else {
            targetClause = ""
        }

        var dueDateLine = ""
        if !dueDate.isEmpty {
            dueDateLine = "\n            set due date of newReminder to date \"\(esc(dueDate))\""
        }

        return """
        tell application id "\(bundleId)"
            set newReminder to make new reminder \(targetClause) with properties {\(props)}\(dueDateLine)
            set rId to id of newReminder
            return "{\\"id\\":\\"" & my jsonEsc(rId) & "\\",\\"name\\":\\"\(esc(name))\\",\\"type\\":\\"reminder\\"}"
        end tell
        """
    }

    // MARK: - Full

    private static func buildUpdateReminder(bundleId: String, parameters: [String: Any]) throws -> String {
        guard let reminderId = parameters["reminderId"] as? String, !reminderId.isEmpty else {
            throw ExecutorError.invalidRequest("reminders.update_reminder requires 'reminderId' parameter")
        }
        var setStatements: [String] = []
        if let name = parameters["name"] as? String {
            setStatements.append("set name of r to \"\(esc(name))\"")
        }
        if let body = parameters["body"] as? String {
            setStatements.append("set body of r to \"\(esc(body))\"")
        }
        if let completed = parameters["completed"] as? Bool {
            setStatements.append("set completed of r to \(completed)")
        }
        if let priority = parameters["priority"] as? Int {
            setStatements.append("set priority of r to \(priority)")
        }
        if let flagged = parameters["flagged"] as? Bool {
            setStatements.append("set flagged of r to \(flagged)")
        }
        if let dueDate = parameters["dueDate"] as? String {
            setStatements.append("set due date of r to date \"\(esc(dueDate))\"")
        }
        if setStatements.isEmpty {
            throw ExecutorError.invalidRequest("reminders.update_reminder requires at least one property to update")
        }
        return """
        tell application id "\(bundleId)"
            set r to reminder id "\(esc(reminderId))"
            \(setStatements.joined(separator: "\n            "))
            return "{\\"id\\":\\"" & my jsonEsc(id of r) & "\\",\\"name\\":\\"" & my jsonEsc(name of r) & "\\",\\"type\\":\\"reminder\\"}"
        end tell
        """
    }

    private static func buildDeleteReminder(bundleId: String, parameters: [String: Any]) throws -> String {
        guard let reminderId = parameters["reminderId"] as? String, !reminderId.isEmpty else {
            throw ExecutorError.invalidRequest("reminders.delete_reminder requires 'reminderId' parameter")
        }
        return """
        tell application id "\(bundleId)"
            set r to reminder id "\(esc(reminderId))"
            set rName to name of r
            delete r
            return "{\\"deleted\\":true,\\"name\\":\\"" & my jsonEsc(rName) & "\\"}"
        end tell
        """
    }

    private static func buildShow(bundleId: String, parameters: [String: Any]) -> String {
        """
        tell application id "\(bundleId)"
            activate
            return "{\\"shown\\":true}"
        end tell
        """
    }

    private static func buildComplete(bundleId: String, parameters: [String: Any]) throws -> String {
        guard let reminderId = parameters["reminderId"] as? String, !reminderId.isEmpty else {
            throw ExecutorError.invalidRequest("reminders.complete requires 'reminderId' parameter")
        }
        return """
        tell application id "\(bundleId)"
            set r to reminder id "\(esc(reminderId))"
            set completed of r to true
            return "{\\"id\\":\\"" & my jsonEsc(id of r) & "\\",\\"completed\\":true}"
        end tell
        """
    }

    private static func esc(_ s: String) -> String {
        s.replacingOccurrences(of: "\\", with: "\\\\")
         .replacingOccurrences(of: "\"", with: "\\\"")
    }
}
