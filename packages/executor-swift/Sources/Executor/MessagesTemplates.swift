import Foundation

/// AppleScript templates for Apple Messages.
/// Messages has a limited AppleScript API: list chats, list participants, send messages.
/// No update/delete support.
enum MessagesTemplates {
    static func build(templateId: String, bundleId: String, parameters: [String: Any]) throws -> String {
        switch templateId {
        case "messages.list_chats":
            return buildListChats(bundleId: bundleId)
        case "messages.list_messages":
            return buildListMessages(bundleId: bundleId, parameters: parameters)
        case "messages.get_chat":
            return try buildGetChat(bundleId: bundleId, parameters: parameters)
        case "messages.search_chats":
            return try buildSearchChats(bundleId: bundleId, parameters: parameters)
        case "messages.send":
            return try buildSend(bundleId: bundleId, parameters: parameters)
        case "messages.show":
            return buildShow(bundleId: bundleId)
        default:
            throw ExecutorError.invalidRequest("Unknown messages template: \(templateId)")
        }
    }

    // MARK: - Readonly

    private static func buildListChats(bundleId: String) -> String {
        """
        tell application id "\(bundleId)"
            set chatList to {}
            repeat with c in chats
                set participantNames to ""
                repeat with p in participants of c
                    if participantNames is not "" then set participantNames to participantNames & ", "
                    set participantNames to participantNames & name of p
                end repeat
                set end of chatList to {chatId:id of c, chatName:name of c, chatParticipants:participantNames}
            end repeat
            set output to "["
            repeat with i from 1 to count of chatList
                set c to item i of chatList
                set output to output & "{\\"id\\":\\"" & my jsonEsc(chatId of c) & "\\",\\"name\\":\\"" & my jsonEsc(chatName of c) & "\\",\\"type\\":\\"chat\\",\\"properties\\":{\\"participants\\":\\"" & my jsonEsc(chatParticipants of c) & "\\"}}"
                if i < (count of chatList) then set output to output & ","
            end repeat
            set output to output & "]"
            return output
        end tell
        """
    }

    private static func buildListMessages(bundleId: String, parameters: [String: Any]) -> String {
        let chatId = parameters["chatId"] as? String ?? ""
        let limit = parameters["limit"] as? Int ?? 50

        let targetClause: String
        if !chatId.isEmpty {
            targetClause = "messages of chat id \"\(esc(chatId))\""
        } else {
            targetClause = "messages"
        }

        return """
        tell application id "\(bundleId)"
            set allMessages to \(targetClause)
            set totalCount to count of allMessages
            set resultCount to totalCount
            if resultCount > \(limit) then set resultCount to \(limit)
            set output to "{\\"total\\":" & (totalCount as text) & ",\\"items\\":["
            repeat with i from 1 to resultCount
                set m to item i of allMessages
                set mId to id of m
                set mSender to ""
                try
                    set mSender to name of sender of m
                end try
                set mDate to date of m as «class isot» as string
                set output to output & "{\\"id\\":" & mId & ",\\"name\\":\\"message\\",\\"type\\":\\"message\\",\\"properties\\":{\\"sender\\":\\"" & my jsonEsc(mSender) & "\\",\\"date\\":\\"" & my jsonEsc(mDate) & "\\"}}"
                if i < resultCount then set output to output & ","
            end repeat
            set output to output & "]}"
            return output
        end tell
        """
    }

    private static func buildGetChat(bundleId: String, parameters: [String: Any]) throws -> String {
        guard let chatId = parameters["chatId"] as? String, !chatId.isEmpty else {
            throw ExecutorError.invalidRequest("messages.get_chat requires 'chatId' parameter")
        }
        return """
        tell application id "\(bundleId)"
            set c to chat id "\(esc(chatId))"
            set cId to id of c
            set cName to name of c
            set participantNames to ""
            repeat with p in participants of c
                if participantNames is not "" then set participantNames to participantNames & ", "
                set participantNames to participantNames & name of p
            end repeat
            set msgCount to count of messages of c
            return "{\\"id\\":\\"" & my jsonEsc(cId) & "\\",\\"name\\":\\"" & my jsonEsc(cName) & "\\",\\"type\\":\\"chat\\",\\"properties\\":{\\"participants\\":\\"" & my jsonEsc(participantNames) & "\\",\\"messageCount\\":" & (msgCount as text) & "}}"
        end tell
        """
    }

    private static func buildSearchChats(bundleId: String, parameters: [String: Any]) throws -> String {
        guard let query = parameters["query"] as? String, !query.isEmpty else {
            throw ExecutorError.invalidRequest("messages.search_chats requires 'query' parameter")
        }
        let limit = parameters["limit"] as? Int ?? 20

        return """
        tell application id "\(bundleId)"
            set matchingChats to chats whose name contains "\(esc(query))"
            set resultCount to count of matchingChats
            if resultCount > \(limit) then set resultCount to \(limit)
            set output to "["
            repeat with i from 1 to resultCount
                set c to item i of matchingChats
                set cId to id of c
                set cName to name of c
                set output to output & "{\\"id\\":\\"" & my jsonEsc(cId) & "\\",\\"name\\":\\"" & my jsonEsc(cName) & "\\",\\"type\\":\\"chat\\"}"
                if i < resultCount then set output to output & ","
            end repeat
            set output to output & "]"
            return output
        end tell
        """
    }

    // MARK: - Actions

    private static func buildSend(bundleId: String, parameters: [String: Any]) throws -> String {
        guard let to = parameters["to"] as? String, !to.isEmpty else {
            throw ExecutorError.invalidRequest("messages.send requires 'to' parameter (phone number or email)")
        }
        guard let message = parameters["message"] as? String, !message.isEmpty else {
            throw ExecutorError.invalidRequest("messages.send requires 'message' parameter")
        }
        let service = esc(parameters["service"] as? String ?? "iMessage")

        return """
        tell application id "\(bundleId)"
            set targetService to 1st service whose service type = \(service == "SMS" ? "SMS" : "iMessage")
            set targetBuddy to buddy "\(esc(to))" of targetService
            send "\(esc(message))" to targetBuddy
            return "{\\"sent\\":true,\\"to\\":\\"\(esc(to))\\"}"
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
