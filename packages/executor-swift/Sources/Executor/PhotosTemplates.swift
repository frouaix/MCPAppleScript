import Foundation

/// AppleScript templates for Apple Photos.
/// Photos has limited AppleScript: list albums, list media items, search, import.
/// No direct update/delete of individual photos.
enum PhotosTemplates {
    static func build(templateId: String, bundleId: String, parameters: [String: Any]) throws -> String {
        switch templateId {
        case "photos.list_albums":
            return buildListAlbums(bundleId: bundleId)
        case "photos.list_items":
            return buildListItems(bundleId: bundleId, parameters: parameters)
        case "photos.get_item":
            return try buildGetItem(bundleId: bundleId, parameters: parameters)
        case "photos.search_items":
            return try buildSearchItems(bundleId: bundleId, parameters: parameters)
        case "photos.create_album":
            return try buildCreateAlbum(bundleId: bundleId, parameters: parameters)
        case "photos.import":
            return try buildImport(bundleId: bundleId, parameters: parameters)
        case "photos.show":
            return buildShow(bundleId: bundleId)
        default:
            throw ExecutorError.invalidRequest("Unknown photos template: \(templateId)")
        }
    }

    // MARK: - Readonly

    private static func buildListAlbums(bundleId: String) -> String {
        """
        tell application id "\(bundleId)"
            set albumList to {}
            repeat with a in albums
                set end of albumList to {albumId:id of a, albumName:name of a, mediaCount:(count of media items of a)}
            end repeat
            set output to "["
            repeat with i from 1 to count of albumList
                set a to item i of albumList
                set output to output & "{\\"id\\":\\"" & albumId of a & "\\",\\"name\\":\\"" & albumName of a & "\\",\\"type\\":\\"album\\",\\"itemCount\\":" & (mediaCount of a as text) & "}"
                if i < (count of albumList) then set output to output & ","
            end repeat
            set output to output & "]"
            return output
        end tell
        """
    }

    private static func buildListItems(bundleId: String, parameters: [String: Any]) -> String {
        let albumId = parameters["albumId"] as? String ?? ""
        let limit = parameters["limit"] as? Int ?? 50
        let offset = parameters["offset"] as? Int ?? 0

        let targetClause: String
        if !albumId.isEmpty {
            targetClause = "media items of album id \"\(esc(albumId))\""
        } else {
            targetClause = "media items"
        }

        return """
        tell application id "\(bundleId)"
            set allItems to \(targetClause)
            set totalCount to count of allItems
            set startIdx to \(offset + 1)
            set endIdx to \(offset + limit)
            if endIdx > totalCount then set endIdx to totalCount
            set output to "{\\"total\\":" & (totalCount as text) & ",\\"items\\":["
            if startIdx ≤ totalCount then
                repeat with i from startIdx to endIdx
                    set m to item i of allItems
                    set mId to id of m
                    set mName to filename of m
                    set mDate to date of m as «class isot» as string
                    set mWidth to width of m
                    set mHeight to height of m
                    set output to output & "{\\"id\\":\\"" & mId & "\\",\\"name\\":\\"" & mName & "\\",\\"type\\":\\"media\\",\\"properties\\":{\\"date\\":\\"" & mDate & "\\",\\"width\\":" & mWidth & ",\\"height\\":" & mHeight & "}}"
                    if i < endIdx then set output to output & ","
                end repeat
            end if
            set output to output & "]}"
            return output
        end tell
        """
    }

    private static func buildGetItem(bundleId: String, parameters: [String: Any]) throws -> String {
        guard let itemId = parameters["itemId"] as? String, !itemId.isEmpty else {
            throw ExecutorError.invalidRequest("photos.get_item requires 'itemId' parameter")
        }
        return """
        tell application id "\(bundleId)"
            set m to media item id "\(esc(itemId))"
            set mId to id of m
            set mName to filename of m
            set mDate to date of m as «class isot» as string
            set mWidth to width of m
            set mHeight to height of m
            set mFav to favorite of m
            set mDesc to description of m
            set mLoc to location of m
            return "{\\"id\\":\\"" & mId & "\\",\\"name\\":\\"" & mName & "\\",\\"type\\":\\"media\\",\\"properties\\":{\\"date\\":\\"" & mDate & "\\",\\"width\\":" & mWidth & ",\\"height\\":" & mHeight & ",\\"favorite\\":" & mFav & ",\\"description\\":\\"" & mDesc & "\\"}}"
        end tell
        """
    }

    private static func buildSearchItems(bundleId: String, parameters: [String: Any]) throws -> String {
        guard let query = parameters["query"] as? String, !query.isEmpty else {
            throw ExecutorError.invalidRequest("photos.search_items requires 'query' parameter")
        }
        let limit = parameters["limit"] as? Int ?? 20

        return """
        tell application id "\(bundleId)"
            set matchingItems to media items whose description contains "\(esc(query))"
            set resultCount to count of matchingItems
            if resultCount > \(limit) then set resultCount to \(limit)
            set output to "["
            repeat with i from 1 to resultCount
                set m to item i of matchingItems
                set mId to id of m
                set mName to filename of m
                set mDate to date of m as «class isot» as string
                set output to output & "{\\"id\\":\\"" & mId & "\\",\\"name\\":\\"" & mName & "\\",\\"type\\":\\"media\\",\\"properties\\":{\\"date\\":\\"" & mDate & "\\"}}"
                if i < resultCount then set output to output & ","
            end repeat
            set output to output & "]"
            return output
        end tell
        """
    }

    // MARK: - Create

    private static func buildCreateAlbum(bundleId: String, parameters: [String: Any]) throws -> String {
        guard let name = parameters["name"] as? String, !name.isEmpty else {
            throw ExecutorError.invalidRequest("photos.create_album requires 'name' parameter")
        }
        return """
        tell application id "\(bundleId)"
            set newAlbum to make new album named "\(esc(name))"
            set aId to id of newAlbum
            return "{\\"id\\":\\"" & aId & "\\",\\"name\\":\\"\(esc(name))\\",\\"type\\":\\"album\\"}"
        end tell
        """
    }

    // MARK: - Actions

    private static func buildImport(bundleId: String, parameters: [String: Any]) throws -> String {
        guard let filePath = parameters["filePath"] as? String, !filePath.isEmpty else {
            throw ExecutorError.invalidRequest("photos.import requires 'filePath' parameter")
        }
        let albumId = parameters["albumId"] as? String ?? ""
        let targetClause: String
        if !albumId.isEmpty {
            targetClause = " into album id \"\(esc(albumId))\""
        } else {
            targetClause = ""
        }
        return """
        tell application id "\(bundleId)"
            import POSIX file "\(esc(filePath))"\(targetClause)
            return "{\\"imported\\":true,\\"filePath\\":\\"\(esc(filePath))\\"}"
        end tell
        """
    }

    private static func buildShow(bundleId: String) -> String {
        """
        tell application id "\(bundleId)"
            activate
            return "{\\"shown\\":true}"
        end tell
        """
    }

    private static func esc(_ s: String) -> String {
        s.replacingOccurrences(of: "\\", with: "\\\\")
         .replacingOccurrences(of: "\"", with: "\\\"")
    }
}
