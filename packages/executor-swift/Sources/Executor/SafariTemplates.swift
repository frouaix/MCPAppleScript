import Foundation

/// AppleScript templates for Safari.
/// Safari API: list windows/tabs, get tab content, do JavaScript, open URL, reading list.
/// No traditional CRUD — tabs are browsing state, not user data items.
enum SafariTemplates {
    static func build(templateId: String, bundleId: String, parameters: [String: Any]) throws -> String {
        switch templateId {
        case "safari.list_windows":
            return buildListWindows(bundleId: bundleId)
        case "safari.list_tabs":
            return buildListTabs(bundleId: bundleId, parameters: parameters)
        case "safari.get_tab":
            return try buildGetTab(bundleId: bundleId, parameters: parameters)
        case "safari.search_tabs":
            return try buildSearchTabs(bundleId: bundleId, parameters: parameters)
        case "safari.open_url":
            return try buildOpenUrl(bundleId: bundleId, parameters: parameters)
        case "safari.close_tab":
            return try buildCloseTab(bundleId: bundleId, parameters: parameters)
        case "safari.show":
            return buildShow(bundleId: bundleId)
        case "safari.do_javascript":
            return try buildDoJavaScript(bundleId: bundleId, parameters: parameters)
        case "safari.add_reading_list":
            return try buildAddReadingList(bundleId: bundleId, parameters: parameters)
        default:
            throw ExecutorError.invalidRequest("Unknown safari template: \(templateId)")
        }
    }

    // MARK: - Readonly

    private static func buildListWindows(bundleId: String) -> String {
        """
        tell application id "\(bundleId)"
            set windowList to {}
            repeat with w in windows
                set wId to id of w
                set wName to name of w
                set tabCount to count of tabs of w
                set end of windowList to {windowId:wId, windowName:wName, tabCount:tabCount}
            end repeat
            set output to "["
            repeat with i from 1 to count of windowList
                set w to item i of windowList
                set output to output & "{\\"id\\":" & (windowId of w) & ",\\"name\\":\\"" & windowName of w & "\\",\\"type\\":\\"window\\",\\"itemCount\\":" & (tabCount of w as text) & "}"
                if i < (count of windowList) then set output to output & ","
            end repeat
            set output to output & "]"
            return output
        end tell
        """
    }

    private static func buildListTabs(bundleId: String, parameters: [String: Any]) -> String {
        let windowId = parameters["windowId"] as? Int ?? 0

        let targetClause: String
        if windowId > 0 {
            targetClause = "tabs of window id \(windowId)"
        } else {
            targetClause = "tabs of front window"
        }

        return """
        tell application id "\(bundleId)"
            set allTabs to \(targetClause)
            set totalCount to count of allTabs
            set output to "{\\"total\\":" & (totalCount as text) & ",\\"items\\":["
            repeat with i from 1 to totalCount
                set t to item i of allTabs
                set tName to name of t
                set tUrl to URL of t
                set output to output & "{\\"id\\":" & i & ",\\"name\\":\\"" & tName & "\\",\\"type\\":\\"tab\\",\\"properties\\":{\\"url\\":\\"" & tUrl & "\\"}}"
                if i < totalCount then set output to output & ","
            end repeat
            set output to output & "]}"
            return output
        end tell
        """
    }

    private static func buildGetTab(bundleId: String, parameters: [String: Any]) throws -> String {
        let tabIndex = parameters["tabIndex"] as? Int ?? 1
        let windowId = parameters["windowId"] as? Int ?? 0

        let windowClause: String
        if windowId > 0 {
            windowClause = "window id \(windowId)"
        } else {
            windowClause = "front window"
        }

        return """
        tell application id "\(bundleId)"
            set t to tab \(tabIndex) of \(windowClause)
            set tName to name of t
            set tUrl to URL of t
            set tSource to source of t
            return "{\\"id\\":\(tabIndex),\\"name\\":\\"" & tName & "\\",\\"type\\":\\"tab\\",\\"properties\\":{\\"url\\":\\"" & tUrl & "\\",\\"source\\":\\"" & tSource & "\\"}}"
        end tell
        """
    }

    private static func buildSearchTabs(bundleId: String, parameters: [String: Any]) throws -> String {
        guard let query = parameters["query"] as? String, !query.isEmpty else {
            throw ExecutorError.invalidRequest("safari.search_tabs requires 'query' parameter")
        }
        let limit = parameters["limit"] as? Int ?? 20

        return """
        tell application id "\(bundleId)"
            set matchingTabs to {}
            repeat with w in windows
                repeat with t in tabs of w
                    if name of t contains "\(esc(query))" or URL of t contains "\(esc(query))" then
                        set end of matchingTabs to {tName:name of t, tUrl:URL of t, tWindow:id of w}
                    end if
                    if (count of matchingTabs) ≥ \(limit) then exit repeat
                end repeat
                if (count of matchingTabs) ≥ \(limit) then exit repeat
            end repeat
            set output to "["
            repeat with i from 1 to count of matchingTabs
                set t to item i of matchingTabs
                set output to output & "{\\"id\\":" & i & ",\\"name\\":\\"" & tName of t & "\\",\\"type\\":\\"tab\\",\\"properties\\":{\\"url\\":\\"" & tUrl of t & "\\",\\"windowId\\":" & (tWindow of t) & "}}"
                if i < (count of matchingTabs) then set output to output & ","
            end repeat
            set output to output & "]"
            return output
        end tell
        """
    }

    // MARK: - Create

    private static func buildOpenUrl(bundleId: String, parameters: [String: Any]) throws -> String {
        guard let url = parameters["url"] as? String, !url.isEmpty else {
            throw ExecutorError.invalidRequest("safari.open_url requires 'url' parameter")
        }
        let newWindow = parameters["newWindow"] as? Bool ?? false

        if newWindow {
            return """
            tell application id "\(bundleId)"
                make new document with properties {URL:"\(esc(url))"}
                return "{\\"opened\\":true,\\"url\\":\\"\(esc(url))\\",\\"newWindow\\":true}"
            end tell
            """
        }

        return """
        tell application id "\(bundleId)"
            tell front window
                set newTab to make new tab with properties {URL:"\(esc(url))"}
            end tell
            return "{\\"opened\\":true,\\"url\\":\\"\(esc(url))\\"}"
        end tell
        """
    }

    // MARK: - Full

    private static func buildCloseTab(bundleId: String, parameters: [String: Any]) throws -> String {
        let tabIndex = parameters["tabIndex"] as? Int ?? 1
        let windowId = parameters["windowId"] as? Int ?? 0

        let windowClause: String
        if windowId > 0 {
            windowClause = "window id \(windowId)"
        } else {
            windowClause = "front window"
        }

        return """
        tell application id "\(bundleId)"
            set t to tab \(tabIndex) of \(windowClause)
            set tName to name of t
            close t
            return "{\\"closed\\":true,\\"name\\":\\"" & tName & "\\"}"
        end tell
        """
    }

    // MARK: - Actions

    private static func buildShow(bundleId: String) -> String {
        """
        tell application id "\(bundleId)"
            activate
            return "{\\"shown\\":true}"
        end tell
        """
    }

    private static func buildDoJavaScript(bundleId: String, parameters: [String: Any]) throws -> String {
        guard let script = parameters["script"] as? String, !script.isEmpty else {
            throw ExecutorError.invalidRequest("safari.do_javascript requires 'script' parameter")
        }
        let tabIndex = parameters["tabIndex"] as? Int ?? 1
        let windowId = parameters["windowId"] as? Int ?? 0

        let windowClause: String
        if windowId > 0 {
            windowClause = "window id \(windowId)"
        } else {
            windowClause = "front window"
        }

        return """
        tell application id "\(bundleId)"
            set result to do JavaScript "\(esc(script))" in tab \(tabIndex) of \(windowClause)
            return "{\\"result\\":\\"" & result & "\\"}"
        end tell
        """
    }

    private static func buildAddReadingList(bundleId: String, parameters: [String: Any]) throws -> String {
        guard let url = parameters["url"] as? String, !url.isEmpty else {
            throw ExecutorError.invalidRequest("safari.add_reading_list requires 'url' parameter")
        }
        let title = esc(parameters["title"] as? String ?? "")
        return """
        tell application id "\(bundleId)"
            add reading list item "\(esc(url))" with title "\(title)"
            return "{\\"added\\":true,\\"url\\":\\"\(esc(url))\\"}"
        end tell
        """
    }

    private static func esc(_ s: String) -> String {
        s.replacingOccurrences(of: "\\", with: "\\\\")
         .replacingOccurrences(of: "\"", with: "\\\"")
    }
}
