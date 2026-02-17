import Foundation

/// AppleScript templates for Apple Notes.
enum NotesTemplates {
    static func build(templateId: String, bundleId: String, parameters: [String: Any]) throws -> String {
        switch templateId {
        case "notes.list_folders":
            return buildListFolders(bundleId: bundleId)
        case "notes.list_notes":
            return buildListNotes(bundleId: bundleId, parameters: parameters)
        case "notes.get_note":
            return try buildGetNote(bundleId: bundleId, parameters: parameters)
        case "notes.search_notes":
            return try buildSearchNotes(bundleId: bundleId, parameters: parameters)
        case "notes.create_note":
            return buildCreateNote(bundleId: bundleId, parameters: parameters)
        case "notes.update_note":
            return try buildUpdateNote(bundleId: bundleId, parameters: parameters)
        case "notes.delete_note":
            return try buildDeleteNote(bundleId: bundleId, parameters: parameters)
        case "notes.show":
            return buildShow(bundleId: bundleId, parameters: parameters)
        default:
            throw ExecutorError.invalidRequest("Unknown notes template: \(templateId)")
        }
    }

    // MARK: - Readonly

    private static func buildListFolders(bundleId: String) -> String {
        """
        tell application id "\(bundleId)"
            set folderList to {}
            repeat with f in folders
                set end of folderList to {id:id of f, name:name of f, itemCount:(count of notes of f)}
            end repeat
            set output to "["
            repeat with i from 1 to count of folderList
                set f to item i of folderList
                set output to output & "{\\"id\\":\\"" & id of f & "\\",\\"name\\":\\"" & name of f & "\\",\\"type\\":\\"folder\\",\\"itemCount\\":" & (itemCount of f as text) & "}"
                if i < (count of folderList) then set output to output & ","
            end repeat
            set output to output & "]"
            return output
        end tell
        """
    }

    private static func buildListNotes(bundleId: String, parameters: [String: Any]) -> String {
        let folderId = parameters["folderId"] as? String ?? ""
        let limit = parameters["limit"] as? Int ?? 50
        let offset = parameters["offset"] as? Int ?? 0

        let targetClause: String
        if !folderId.isEmpty {
            targetClause = "notes of folder id \"\(esc(folderId))\""
        } else {
            targetClause = "notes"
        }

        return """
        tell application id "\(bundleId)"
            set allNotes to \(targetClause)
            set totalCount to count of allNotes
            set startIdx to \(offset + 1)
            set endIdx to \(offset + limit)
            if endIdx > totalCount then set endIdx to totalCount
            set output to "{\\"total\\":" & (totalCount as text) & ",\\"items\\":["
            if startIdx ≤ totalCount then
                repeat with i from startIdx to endIdx
                    set n to item i of allNotes
                    set nId to id of n
                    set nName to name of n
                    set nDate to modification date of n as «class isot» as string
                    set output to output & "{\\"id\\":\\"" & nId & "\\",\\"name\\":\\"" & nName & "\\",\\"type\\":\\"note\\",\\"modifiedAt\\":\\"" & nDate & "\\"}"
                    if i < endIdx then set output to output & ","
                end repeat
            end if
            set output to output & "]}"
            return output
        end tell
        """
    }

    private static func buildGetNote(bundleId: String, parameters: [String: Any]) throws -> String {
        guard let noteId = parameters["noteId"] as? String, !noteId.isEmpty else {
            throw ExecutorError.invalidRequest("notes.get_note requires 'noteId' parameter")
        }
        return """
        tell application id "\(bundleId)"
            set n to note id "\(esc(noteId))"
            set nId to id of n
            set nName to name of n
            set nBody to plaintext of n
            set nCreated to creation date of n as «class isot» as string
            set nModified to modification date of n as «class isot» as string
            set cName to name of container of n
            return "{\\"id\\":\\"" & nId & "\\",\\"name\\":\\"" & nName & "\\",\\"type\\":\\"note\\",\\"containerName\\":\\"" & cName & "\\",\\"createdAt\\":\\"" & nCreated & "\\",\\"modifiedAt\\":\\"" & nModified & "\\",\\"properties\\":{\\"body\\":\\"" & nBody & "\\"}}"
        end tell
        """
    }

    private static func buildSearchNotes(bundleId: String, parameters: [String: Any]) throws -> String {
        guard let query = parameters["query"] as? String, !query.isEmpty else {
            throw ExecutorError.invalidRequest("notes.search_notes requires 'query' parameter")
        }
        let limit = parameters["limit"] as? Int ?? 20

        return """
        tell application id "\(bundleId)"
            set matchingNotes to notes whose name contains "\(esc(query))"
            set resultCount to count of matchingNotes
            if resultCount > \(limit) then set resultCount to \(limit)
            set output to "["
            repeat with i from 1 to resultCount
                set n to item i of matchingNotes
                set nId to id of n
                set nName to name of n
                set nDate to modification date of n as «class isot» as string
                set output to output & "{\\"id\\":\\"" & nId & "\\",\\"name\\":\\"" & nName & "\\",\\"type\\":\\"note\\",\\"modifiedAt\\":\\"" & nDate & "\\"}"
                if i < resultCount then set output to output & ","
            end repeat
            set output to output & "]"
            return output
        end tell
        """
    }

    // MARK: - Create

    private static func buildCreateNote(bundleId: String, parameters: [String: Any]) -> String {
        let title = esc(parameters["title"] as? String ?? "Untitled")
        let body = esc(parameters["body"] as? String ?? "")
        let folderId = parameters["folderId"] as? String ?? ""

        let targetClause: String
        if !folderId.isEmpty {
            targetClause = "in folder id \"\(esc(folderId))\""
        } else {
            targetClause = ""
        }

        return """
        tell application id "\(bundleId)"
            set newNote to make new note \(targetClause) with properties {name:"\(title)", body:"\(body)"}
            set nId to id of newNote
            set nName to name of newNote
            return "{\\"id\\":\\"" & nId & "\\",\\"name\\":\\"" & nName & "\\",\\"type\\":\\"note\\"}"
        end tell
        """
    }

    // MARK: - Full

    private static func buildUpdateNote(bundleId: String, parameters: [String: Any]) throws -> String {
        guard let noteId = parameters["noteId"] as? String, !noteId.isEmpty else {
            throw ExecutorError.invalidRequest("notes.update_note requires 'noteId' parameter")
        }
        var setStatements: [String] = []
        if let name = parameters["name"] as? String {
            setStatements.append("set name of n to \"\(esc(name))\"")
        }
        if let body = parameters["body"] as? String {
            setStatements.append("set body of n to \"\(esc(body))\"")
        }
        if setStatements.isEmpty {
            throw ExecutorError.invalidRequest("notes.update_note requires at least one property to update")
        }
        return """
        tell application id "\(bundleId)"
            set n to note id "\(esc(noteId))"
            \(setStatements.joined(separator: "\n            "))
            return "{\\"id\\":\\"" & (id of n) & "\\",\\"name\\":\\"" & (name of n) & "\\",\\"type\\":\\"note\\"}"
        end tell
        """
    }

    private static func buildDeleteNote(bundleId: String, parameters: [String: Any]) throws -> String {
        guard let noteId = parameters["noteId"] as? String, !noteId.isEmpty else {
            throw ExecutorError.invalidRequest("notes.delete_note requires 'noteId' parameter")
        }
        return """
        tell application id "\(bundleId)"
            set n to note id "\(esc(noteId))"
            set nName to name of n
            delete n
            return "{\\"deleted\\":true,\\"name\\":\\"" & nName & "\\"}"
        end tell
        """
    }

    private static func buildShow(bundleId: String, parameters: [String: Any]) -> String {
        let noteId = parameters["noteId"] as? String ?? ""
        if noteId.isEmpty {
            return """
            tell application id "\(bundleId)"
                activate
                return "{\\"shown\\":true}"
            end tell
            """
        }
        return """
        tell application id "\(bundleId)"
            activate
            show note id "\(esc(noteId))"
            return "{\\"shown\\":true}"
        end tell
        """
    }

    private static func esc(_ s: String) -> String {
        s.replacingOccurrences(of: "\\", with: "\\\\")
         .replacingOccurrences(of: "\"", with: "\\\"")
    }
}
