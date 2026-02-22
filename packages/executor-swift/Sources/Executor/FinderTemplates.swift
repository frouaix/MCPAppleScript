import Foundation

/// AppleScript templates for Finder.
enum FinderTemplates {
    static func build(templateId: String, bundleId: String, parameters: [String: Any]) throws -> String {
        switch templateId {
        case "finder.list_folders":
            return try buildListFolders(bundleId: bundleId, parameters: parameters)
        case "finder.list_items":
            return try buildListItems(bundleId: bundleId, parameters: parameters)
        case "finder.get_item":
            return try buildGetItem(bundleId: bundleId, parameters: parameters)
        case "finder.search_items":
            return try buildSearchItems(bundleId: bundleId, parameters: parameters)
        case "finder.create_folder":
            return try buildCreateFolder(bundleId: bundleId, parameters: parameters)
        case "finder.move_item":
            return try buildMoveItem(bundleId: bundleId, parameters: parameters)
        case "finder.duplicate_item":
            return try buildDuplicateItem(bundleId: bundleId, parameters: parameters)
        case "finder.delete_item":
            return try buildDeleteItem(bundleId: bundleId, parameters: parameters)
        case "finder.show":
            return try buildShow(bundleId: bundleId, parameters: parameters)
        case "finder.reveal":
            return try buildReveal(bundleId: bundleId, parameters: parameters)
        default:
            throw ExecutorError.invalidRequest("Unknown finder template: \(templateId)")
        }
    }

    // MARK: - Readonly

    private static func buildListFolders(bundleId: String, parameters: [String: Any]) throws -> String {
        let path = parameters["path"] as? String ?? "~"
        return """
        tell application id "\(bundleId)"
            set targetFolder to POSIX file "\(esc(path))" as alias
            set folderList to {}
            repeat with f in folders of folder targetFolder
                set end of folderList to {fName:name of f, fPath:POSIX path of (f as alias)}
            end repeat
            set output to "["
            repeat with i from 1 to count of folderList
                set f to item i of folderList
                set output to output & "{\\"id\\":\\"" & my jsonEsc(fPath of f) & "\\",\\"name\\":\\"" & my jsonEsc(fName of f) & "\\",\\"type\\":\\"folder\\"}"
                if i < (count of folderList) then set output to output & ","
            end repeat
            set output to output & "]"
            return output
        end tell
        """
    }

    private static func buildListItems(bundleId: String, parameters: [String: Any]) throws -> String {
        let path = parameters["path"] as? String ?? "~"
        let limit = parameters["limit"] as? Int ?? 50
        let offset = parameters["offset"] as? Int ?? 0

        return """
        tell application id "\(bundleId)"
            set targetFolder to POSIX file "\(esc(path))" as alias
            set allItems to items of folder targetFolder
            set totalCount to count of allItems
            set startIdx to \(offset + 1)
            set endIdx to \(offset + limit)
            if endIdx > totalCount then set endIdx to totalCount
            set output to "{\\"total\\":" & (totalCount as text) & ",\\"items\\":["
            if startIdx ≤ totalCount then
                repeat with i from startIdx to endIdx
                    set f to item i of allItems
                    set fName to name of f
                    set fPath to POSIX path of (f as alias)
                    set fKind to kind of f
                    set fSize to size of f
                    set fDate to modification date of f as «class isot» as string
                    set output to output & "{\\"id\\":\\"" & my jsonEsc(fPath) & "\\",\\"name\\":\\"" & my jsonEsc(fName) & "\\",\\"type\\":\\"file\\",\\"modifiedAt\\":\\"" & my jsonEsc(fDate) & "\\",\\"properties\\":{\\"kind\\":\\"" & my jsonEsc(fKind) & "\\",\\"size\\":" & fSize & "}}"
                    if i < endIdx then set output to output & ","
                end repeat
            end if
            set output to output & "]}"
            return output
        end tell
        """
    }

    private static func buildGetItem(bundleId: String, parameters: [String: Any]) throws -> String {
        guard let path = parameters["path"] as? String, !path.isEmpty else {
            throw ExecutorError.invalidRequest("finder.get_item requires 'path' parameter")
        }
        return """
        tell application id "\(bundleId)"
            set f to POSIX file "\(esc(path))" as alias
            set fi to info for f
            set fName to name of fi
            set fKind to kind of fi
            set fSize to size of fi
            set fCreated to creation date of fi as «class isot» as string
            set fModified to modification date of fi as «class isot» as string
            return "{\\"id\\":\\"" & my jsonEsc(POSIX path of f) & "\\",\\"name\\":\\"" & my jsonEsc(fName) & "\\",\\"type\\":\\"file\\",\\"createdAt\\":\\"" & my jsonEsc(fCreated) & "\\",\\"modifiedAt\\":\\"" & my jsonEsc(fModified) & "\\",\\"properties\\":{\\"kind\\":\\"" & my jsonEsc(fKind) & "\\",\\"size\\":" & fSize & "}}"
        end tell
        """
    }

    private static func buildSearchItems(bundleId: String, parameters: [String: Any]) throws -> String {
        guard let query = parameters["query"] as? String, !query.isEmpty else {
            throw ExecutorError.invalidRequest("finder.search_items requires 'query' parameter")
        }
        let path = parameters["path"] as? String ?? "~"
        let limit = parameters["limit"] as? Int ?? 20

        return """
        tell application id "\(bundleId)"
            set targetFolder to POSIX file "\(esc(path))" as alias
            set matchingItems to (every item of folder targetFolder whose name contains "\(esc(query))")
            set resultCount to count of matchingItems
            if resultCount > \(limit) then set resultCount to \(limit)
            set output to "["
            repeat with i from 1 to resultCount
                set f to item i of matchingItems
                set fName to name of f
                set fPath to POSIX path of (f as alias)
                set output to output & "{\\"id\\":\\"" & my jsonEsc(fPath) & "\\",\\"name\\":\\"" & my jsonEsc(fName) & "\\",\\"type\\":\\"file\\"}"
                if i < resultCount then set output to output & ","
            end repeat
            set output to output & "]"
            return output
        end tell
        """
    }

    // MARK: - Create

    private static func buildCreateFolder(bundleId: String, parameters: [String: Any]) throws -> String {
        guard let name = parameters["name"] as? String, !name.isEmpty else {
            throw ExecutorError.invalidRequest("finder.create_folder requires 'name' parameter")
        }
        let parentPath = parameters["parentPath"] as? String ?? "~"
        return """
        tell application id "\(bundleId)"
            set parentFolder to POSIX file "\(esc(parentPath))" as alias
            set newFolder to make new folder at folder parentFolder with properties {name:"\(esc(name))"}
            set fPath to POSIX path of (newFolder as alias)
            return "{\\"id\\":\\"" & my jsonEsc(fPath) & "\\",\\"name\\":\\"\(esc(name))\\",\\"type\\":\\"folder\\"}"
        end tell
        """
    }

    // MARK: - Full

    private static func buildMoveItem(bundleId: String, parameters: [String: Any]) throws -> String {
        guard let sourcePath = parameters["sourcePath"] as? String, !sourcePath.isEmpty else {
            throw ExecutorError.invalidRequest("finder.move_item requires 'sourcePath' parameter")
        }
        guard let destPath = parameters["destPath"] as? String, !destPath.isEmpty else {
            throw ExecutorError.invalidRequest("finder.move_item requires 'destPath' parameter")
        }
        return """
        tell application id "\(bundleId)"
            set sourceItem to POSIX file "\(esc(sourcePath))" as alias
            set destFolder to POSIX file "\(esc(destPath))" as alias
            move sourceItem to folder destFolder
            return "{\\"moved\\":true,\\"from\\":\\"\(esc(sourcePath))\\",\\"to\\":\\"\(esc(destPath))\\"}"
        end tell
        """
    }

    private static func buildDuplicateItem(bundleId: String, parameters: [String: Any]) throws -> String {
        guard let sourcePath = parameters["sourcePath"] as? String, !sourcePath.isEmpty else {
            throw ExecutorError.invalidRequest("finder.duplicate_item requires 'sourcePath' parameter")
        }
        let destPath = parameters["destPath"] as? String ?? ""
        let destClause: String
        if !destPath.isEmpty {
            destClause = " to folder (POSIX file \"\(esc(destPath))\" as alias)"
        } else {
            destClause = ""
        }
        return """
        tell application id "\(bundleId)"
            set sourceItem to POSIX file "\(esc(sourcePath))" as alias
            set dupItem to duplicate sourceItem\(destClause)
            set dupPath to POSIX path of (dupItem as alias)
            return "{\\"duplicated\\":true,\\"path\\":\\"" & my jsonEsc(dupPath) & "\\"}"
        end tell
        """
    }

    private static func buildDeleteItem(bundleId: String, parameters: [String: Any]) throws -> String {
        guard let path = parameters["path"] as? String, !path.isEmpty else {
            throw ExecutorError.invalidRequest("finder.delete_item requires 'path' parameter")
        }
        return """
        tell application id "\(bundleId)"
            set targetItem to POSIX file "\(esc(path))" as alias
            set itemName to name of targetItem
            delete targetItem
            return "{\\"deleted\\":true,\\"name\\":\\"" & my jsonEsc(itemName) & "\\"}"
        end tell
        """
    }

    // MARK: - Actions

    private static func buildShow(bundleId: String, parameters: [String: Any]) throws -> String {
        let path = parameters["path"] as? String ?? ""
        if path.isEmpty {
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
            set targetFolder to POSIX file "\(esc(path))" as alias
            open folder targetFolder
            return "{\\"shown\\":true}"
        end tell
        """
    }

    private static func buildReveal(bundleId: String, parameters: [String: Any]) throws -> String {
        guard let path = parameters["path"] as? String, !path.isEmpty else {
            throw ExecutorError.invalidRequest("finder.reveal requires 'path' parameter")
        }
        return """
        tell application id "\(bundleId)"
            activate
            reveal POSIX file "\(esc(path))" as alias
            return "{\\"revealed\\":true}"
        end tell
        """
    }

    private static func esc(_ s: String) -> String {
        s.replacingOccurrences(of: "\\", with: "\\\\")
         .replacingOccurrences(of: "\"", with: "\\\"")
    }
}
