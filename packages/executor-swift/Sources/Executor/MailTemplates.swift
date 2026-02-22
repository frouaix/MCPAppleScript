import Foundation

/// AppleScript templates for Apple Mail.
enum MailTemplates {
    static func build(templateId: String, bundleId: String, parameters: [String: Any]) throws -> String {
        switch templateId {
        case "mail.list_mailboxes":
            return buildListMailboxes(bundleId: bundleId)
        case "mail.list_messages":
            return buildListMessages(bundleId: bundleId, parameters: parameters)
        case "mail.get_message":
            return try buildGetMessage(bundleId: bundleId, parameters: parameters)
        case "mail.search_messages":
            return try buildSearchMessages(bundleId: bundleId, parameters: parameters)
        case "mail.create_draft":
            return try buildCreateDraft(bundleId: bundleId, parameters: parameters)
        case "mail.update_message":
            return try buildUpdateMessage(bundleId: bundleId, parameters: parameters)
        case "mail.delete_message":
            return try buildDeleteMessage(bundleId: bundleId, parameters: parameters)
        case "mail.show":
            return buildShow(bundleId: bundleId)
        case "mail.send":
            return try buildSend(bundleId: bundleId, parameters: parameters)
        default:
            throw ExecutorError.invalidRequest("Unknown mail template: \(templateId)")
        }
    }

    // MARK: - Readonly

    private static func buildListMailboxes(bundleId: String) -> String {
        """
        tell application id "\(bundleId)"
            set mboxList to {}
            repeat with acct in accounts
                repeat with mbox in mailboxes of acct
                    set end of mboxList to {mboxName:name of mbox, acctName:name of acct, msgCount:count of messages of mbox}
                end repeat
            end repeat
            set output to "["
            repeat with i from 1 to count of mboxList
                set m to item i of mboxList
                set output to output & "{\\"id\\":\\"" & my jsonEsc(acctName of m) & "/" & my jsonEsc(mboxName of m) & "\\",\\"name\\":\\"" & my jsonEsc(mboxName of m) & "\\",\\"type\\":\\"mailbox\\",\\"itemCount\\":" & (msgCount of m as text) & ",\\"properties\\":{\\"account\\":\\"" & my jsonEsc(acctName of m) & "\\"}}"
                if i < (count of mboxList) then set output to output & ","
            end repeat
            set output to output & "]"
            return output
        end tell
        """
    }

    private static func buildListMessages(bundleId: String, parameters: [String: Any]) -> String {
        let mailboxName = parameters["mailboxName"] as? String ?? "INBOX"
        let limit = parameters["limit"] as? Int ?? 50
        let offset = parameters["offset"] as? Int ?? 0

        return """
        tell application id "\(bundleId)"
            set targetMailbox to mailbox "\(esc(mailboxName))"
            set allMessages to messages of targetMailbox
            set totalCount to count of allMessages
            set startIdx to \(offset + 1)
            set endIdx to \(offset + limit)
            if endIdx > totalCount then set endIdx to totalCount
            set output to "{\\"total\\":" & (totalCount as text) & ",\\"items\\":["
            if startIdx ≤ totalCount then
                repeat with i from startIdx to endIdx
                    set m to item i of allMessages
                    set mId to id of m
                    set mSubject to subject of m
                    set mSender to sender of m
                    set mDate to date received of m as «class isot» as string
                    set mRead to read status of m
                    set output to output & "{\\"id\\":" & mId & ",\\"name\\":\\"" & my jsonEsc(mSubject) & "\\",\\"type\\":\\"message\\",\\"properties\\":{\\"sender\\":\\"" & my jsonEsc(mSender) & "\\",\\"dateReceived\\":\\"" & my jsonEsc(mDate) & "\\",\\"read\\":" & mRead & "}}"
                    if i < endIdx then set output to output & ","
                end repeat
            end if
            set output to output & "]}"
            return output
        end tell
        """
    }

    private static func buildGetMessage(bundleId: String, parameters: [String: Any]) throws -> String {
        guard let messageId = parameters["messageId"] as? String, !messageId.isEmpty else {
            throw ExecutorError.invalidRequest("mail.get_message requires 'messageId' parameter")
        }
        return """
        tell application id "\(bundleId)"
            set m to first message of mailboxes whose id is \(esc(messageId))
            set mId to id of m
            set mSubject to subject of m
            set mSender to sender of m
            set mDate to date received of m as «class isot» as string
            set mRead to read status of m
            set mContent to content of m
            set recipList to ""
            repeat with r in to recipients of m
                if recipList is not "" then set recipList to recipList & ", "
                set recipList to recipList & address of r
            end repeat
            return "{\\"id\\":" & mId & ",\\"name\\":\\"" & my jsonEsc(mSubject) & "\\",\\"type\\":\\"message\\",\\"properties\\":{\\"sender\\":\\"" & my jsonEsc(mSender) & "\\",\\"to\\":\\"" & my jsonEsc(recipList) & "\\",\\"dateReceived\\":\\"" & my jsonEsc(mDate) & "\\",\\"read\\":" & mRead & ",\\"body\\":\\"" & my jsonEsc(mContent) & "\\"}}"
        end tell
        """
    }

    private static func buildSearchMessages(bundleId: String, parameters: [String: Any]) throws -> String {
        guard let query = parameters["query"] as? String, !query.isEmpty else {
            throw ExecutorError.invalidRequest("mail.search_messages requires 'query' parameter")
        }
        let limit = parameters["limit"] as? Int ?? 20

        return """
        tell application id "\(bundleId)"
            set matchingMessages to {}
            repeat with acct in accounts
                repeat with mbox in mailboxes of acct
                    repeat with m in (messages of mbox whose subject contains "\(esc(query))")
                        set end of matchingMessages to m
                        if (count of matchingMessages) ≥ \(limit) then exit repeat
                    end repeat
                    if (count of matchingMessages) ≥ \(limit) then exit repeat
                end repeat
                if (count of matchingMessages) ≥ \(limit) then exit repeat
            end repeat
            set resultCount to count of matchingMessages
            set output to "["
            repeat with i from 1 to resultCount
                set m to item i of matchingMessages
                set mId to id of m
                set mSubject to subject of m
                set mSender to sender of m
                set mDate to date received of m as «class isot» as string
                set output to output & "{\\"id\\":" & mId & ",\\"name\\":\\"" & my jsonEsc(mSubject) & "\\",\\"type\\":\\"message\\",\\"properties\\":{\\"sender\\":\\"" & my jsonEsc(mSender) & "\\",\\"dateReceived\\":\\"" & my jsonEsc(mDate) & "\\"}}"
                if i < resultCount then set output to output & ","
            end repeat
            set output to output & "]"
            return output
        end tell
        """
    }

    // MARK: - Create

    private static func buildCreateDraft(bundleId: String, parameters: [String: Any]) throws -> String {
        guard let to = parameters["to"] as? String, !to.isEmpty else {
            throw ExecutorError.invalidRequest("mail.create_draft requires 'to' parameter")
        }
        let subject = esc(parameters["subject"] as? String ?? "")
        let body = esc(parameters["body"] as? String ?? "")

        return """
        tell application id "\(bundleId)"
            set newMessage to make new outgoing message with properties {subject:"\(subject)", content:"\(body)", visible:true}
            tell newMessage
                make new to recipient at end of to recipients with properties {address:"\(esc(to))"}
            end tell
            return "{\\"id\\":\\"draft\\",\\"name\\":\\"" & my jsonEsc(subject of newMessage) & "\\",\\"type\\":\\"message\\"}"
        end tell
        """
    }

    // MARK: - Full

    private static func buildUpdateMessage(bundleId: String, parameters: [String: Any]) throws -> String {
        guard let messageId = parameters["messageId"] as? String, !messageId.isEmpty else {
            throw ExecutorError.invalidRequest("mail.update_message requires 'messageId' parameter")
        }
        var setStatements: [String] = []
        if let read = parameters["read"] as? Bool {
            setStatements.append("set read status of m to \(read)")
        }
        if let flagged = parameters["flagged"] as? Bool {
            setStatements.append("set flagged status of m to \(flagged)")
        }
        if setStatements.isEmpty {
            throw ExecutorError.invalidRequest("mail.update_message requires at least one property to update")
        }
        return """
        tell application id "\(bundleId)"
            set m to first message of mailboxes whose id is \(esc(messageId))
            \(setStatements.joined(separator: "\n            "))
            return "{\\"id\\":" & (id of m) & ",\\"name\\":\\"" & my jsonEsc(subject of m) & "\\",\\"type\\":\\"message\\"}"
        end tell
        """
    }

    private static func buildDeleteMessage(bundleId: String, parameters: [String: Any]) throws -> String {
        guard let messageId = parameters["messageId"] as? String, !messageId.isEmpty else {
            throw ExecutorError.invalidRequest("mail.delete_message requires 'messageId' parameter")
        }
        return """
        tell application id "\(bundleId)"
            set m to first message of mailboxes whose id is \(esc(messageId))
            set mSubject to subject of m
            delete m
            return "{\\"deleted\\":true,\\"name\\":\\"" & my jsonEsc(mSubject) & "\\"}"
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

    private static func buildSend(bundleId: String, parameters: [String: Any]) throws -> String {
        guard let to = parameters["to"] as? String, !to.isEmpty else {
            throw ExecutorError.invalidRequest("mail.send requires 'to' parameter")
        }
        let subject = esc(parameters["subject"] as? String ?? "")
        let body = esc(parameters["body"] as? String ?? "")

        return """
        tell application id "\(bundleId)"
            set newMessage to make new outgoing message with properties {subject:"\(subject)", content:"\(body)", visible:false}
            tell newMessage
                make new to recipient at end of to recipients with properties {address:"\(esc(to))"}
            end tell
            send newMessage
            return "{\\"sent\\":true,\\"to\\":\\"\(esc(to))\\"}"
        end tell
        """
    }

    private static func esc(_ s: String) -> String {
        s.replacingOccurrences(of: "\\", with: "\\\\")
         .replacingOccurrences(of: "\"", with: "\\\"")
    }
}
