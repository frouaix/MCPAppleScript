import Foundation

/// AppleScript templates for Apple Contacts.
enum ContactsTemplates {
    static func build(templateId: String, bundleId: String, parameters: [String: Any]) throws -> String {
        switch templateId {
        case "contacts.list_groups":
            return buildListGroups(bundleId: bundleId)
        case "contacts.list_people":
            return buildListPeople(bundleId: bundleId, parameters: parameters)
        case "contacts.get_person":
            return try buildGetPerson(bundleId: bundleId, parameters: parameters)
        case "contacts.search_people":
            return try buildSearchPeople(bundleId: bundleId, parameters: parameters)
        case "contacts.create_person":
            return try buildCreatePerson(bundleId: bundleId, parameters: parameters)
        case "contacts.update_person":
            return try buildUpdatePerson(bundleId: bundleId, parameters: parameters)
        case "contacts.delete_person":
            return try buildDeletePerson(bundleId: bundleId, parameters: parameters)
        case "contacts.show":
            return buildShow(bundleId: bundleId)
        default:
            throw ExecutorError.invalidRequest("Unknown contacts template: \(templateId)")
        }
    }

    // MARK: - Readonly

    private static func buildListGroups(bundleId: String) -> String {
        """
        tell application id "\(bundleId)"
            set groupList to {}
            repeat with g in groups
                set end of groupList to {groupId:id of g, groupName:name of g, personCount:(count of people of g)}
            end repeat
            set output to "["
            repeat with i from 1 to count of groupList
                set g to item i of groupList
                set output to output & "{\\"id\\":\\"" & my jsonEsc(groupId of g) & "\\",\\"name\\":\\"" & my jsonEsc(groupName of g) & "\\",\\"type\\":\\"group\\",\\"itemCount\\":" & (personCount of g as text) & "}"
                if i < (count of groupList) then set output to output & ","
            end repeat
            set output to output & "]"
            return output
        end tell
        """
    }

    private static func buildListPeople(bundleId: String, parameters: [String: Any]) -> String {
        let groupId = parameters["groupId"] as? String ?? ""
        let limit = parameters["limit"] as? Int ?? 50
        let offset = parameters["offset"] as? Int ?? 0

        let targetClause: String
        if !groupId.isEmpty {
            targetClause = "people of group id \"\(esc(groupId))\""
        } else {
            targetClause = "people"
        }

        return """
        tell application id "\(bundleId)"
            set allPeople to \(targetClause)
            set totalCount to count of allPeople
            set startIdx to \(offset + 1)
            set endIdx to \(offset + limit)
            if endIdx > totalCount then set endIdx to totalCount
            set output to "{\\"total\\":" & (totalCount as text) & ",\\"items\\":["
            if startIdx ≤ totalCount then
                repeat with i from startIdx to endIdx
                    set p to item i of allPeople
                    set pId to id of p
                    set pFirst to first name of p
                    set pLast to last name of p
                    set pName to pFirst & " " & pLast
                    set output to output & "{\\"id\\":\\"" & my jsonEsc(pId) & "\\",\\"name\\":\\"" & my jsonEsc(pName) & "\\",\\"type\\":\\"person\\",\\"properties\\":{\\"firstName\\":\\"" & my jsonEsc(pFirst) & "\\",\\"lastName\\":\\"" & my jsonEsc(pLast) & "\\"}}"
                    if i < endIdx then set output to output & ","
                end repeat
            end if
            set output to output & "]}"
            return output
        end tell
        """
    }

    private static func buildGetPerson(bundleId: String, parameters: [String: Any]) throws -> String {
        guard let personId = parameters["personId"] as? String, !personId.isEmpty else {
            throw ExecutorError.invalidRequest("contacts.get_person requires 'personId' parameter")
        }
        return """
        tell application id "\(bundleId)"
            set p to person id "\(esc(personId))"
            set pId to id of p
            set pFirst to first name of p
            set pLast to last name of p
            set pOrg to organization of p
            set pTitle to job title of p
            set pNote to note of p
            set emailList to ""
            repeat with e in emails of p
                if emailList is not "" then set emailList to emailList & ", "
                set emailList to emailList & value of e
            end repeat
            set phoneList to ""
            repeat with ph in phones of p
                if phoneList is not "" then set phoneList to phoneList & ", "
                set phoneList to phoneList & value of ph
            end repeat
            return "{\\"id\\":\\"" & my jsonEsc(pId) & "\\",\\"name\\":\\"" & my jsonEsc(pFirst) & " " & my jsonEsc(pLast) & "\\",\\"type\\":\\"person\\",\\"properties\\":{\\"firstName\\":\\"" & my jsonEsc(pFirst) & "\\",\\"lastName\\":\\"" & my jsonEsc(pLast) & "\\",\\"organization\\":\\"" & my jsonEsc(pOrg) & "\\",\\"jobTitle\\":\\"" & my jsonEsc(pTitle) & "\\",\\"note\\":\\"" & my jsonEsc(pNote) & "\\",\\"emails\\":\\"" & my jsonEsc(emailList) & "\\",\\"phones\\":\\"" & my jsonEsc(phoneList) & "\\"}}"
        end tell
        """
    }

    private static func buildSearchPeople(bundleId: String, parameters: [String: Any]) throws -> String {
        guard let query = parameters["query"] as? String, !query.isEmpty else {
            throw ExecutorError.invalidRequest("contacts.search_people requires 'query' parameter")
        }
        let limit = parameters["limit"] as? Int ?? 20

        return """
        tell application id "\(bundleId)"
            set matchingPeople to people whose name contains "\(esc(query))"
            set resultCount to count of matchingPeople
            if resultCount > \(limit) then set resultCount to \(limit)
            set output to "["
            repeat with i from 1 to resultCount
                set p to item i of matchingPeople
                set pId to id of p
                set pFirst to first name of p
                set pLast to last name of p
                set output to output & "{\\"id\\":\\"" & my jsonEsc(pId) & "\\",\\"name\\":\\"" & my jsonEsc(pFirst) & " " & my jsonEsc(pLast) & "\\",\\"type\\":\\"person\\"}"
                if i < resultCount then set output to output & ","
            end repeat
            set output to output & "]"
            return output
        end tell
        """
    }

    // MARK: - Create

    private static func buildCreatePerson(bundleId: String, parameters: [String: Any]) throws -> String {
        guard let firstName = parameters["firstName"] as? String, !firstName.isEmpty else {
            throw ExecutorError.invalidRequest("contacts.create_person requires 'firstName' parameter")
        }
        let lastName = esc(parameters["lastName"] as? String ?? "")
        let organization = esc(parameters["organization"] as? String ?? "")
        let email = parameters["email"] as? String ?? ""
        let phone = parameters["phone"] as? String ?? ""
        let groupId = parameters["groupId"] as? String ?? ""

        var extraLines: [String] = []
        if !email.isEmpty {
            extraLines.append("make new email at end of emails of newPerson with properties {label:\"work\", value:\"\(esc(email))\"}")
        }
        if !phone.isEmpty {
            extraLines.append("make new phone at end of phones of newPerson with properties {label:\"mobile\", value:\"\(esc(phone))\"}")
        }
        if !groupId.isEmpty {
            extraLines.append("add newPerson to group id \"\(esc(groupId))\"")
        }

        var props = "first name:\"\(esc(firstName))\""
        if !lastName.isEmpty { props += ", last name:\"\(lastName)\"" }
        if !organization.isEmpty { props += ", organization:\"\(organization)\"" }

        return """
        tell application id "\(bundleId)"
            set newPerson to make new person with properties {\(props)}
            \(extraLines.joined(separator: "\n            "))
            save
            set pId to id of newPerson
            return "{\\"id\\":\\"" & my jsonEsc(pId) & "\\",\\"name\\":\\"\(esc(firstName)) \(lastName)\\",\\"type\\":\\"person\\"}"
        end tell
        """
    }

    // MARK: - Full

    private static func buildUpdatePerson(bundleId: String, parameters: [String: Any]) throws -> String {
        guard let personId = parameters["personId"] as? String, !personId.isEmpty else {
            throw ExecutorError.invalidRequest("contacts.update_person requires 'personId' parameter")
        }
        var setStatements: [String] = []
        if let firstName = parameters["firstName"] as? String {
            setStatements.append("set first name of p to \"\(esc(firstName))\"")
        }
        if let lastName = parameters["lastName"] as? String {
            setStatements.append("set last name of p to \"\(esc(lastName))\"")
        }
        if let organization = parameters["organization"] as? String {
            setStatements.append("set organization of p to \"\(esc(organization))\"")
        }
        if let jobTitle = parameters["jobTitle"] as? String {
            setStatements.append("set job title of p to \"\(esc(jobTitle))\"")
        }
        if let note = parameters["note"] as? String {
            setStatements.append("set note of p to \"\(esc(note))\"")
        }
        if setStatements.isEmpty {
            throw ExecutorError.invalidRequest("contacts.update_person requires at least one property to update")
        }
        return """
        tell application id "\(bundleId)"
            set p to person id "\(esc(personId))"
            \(setStatements.joined(separator: "\n            "))
            save
            return "{\\"id\\":\\"" & my jsonEsc(id of p) & "\\",\\"name\\":\\"" & my jsonEsc(first name of p) & " " & my jsonEsc(last name of p) & "\\",\\"type\\":\\"person\\"}"
        end tell
        """
    }

    private static func buildDeletePerson(bundleId: String, parameters: [String: Any]) throws -> String {
        guard let personId = parameters["personId"] as? String, !personId.isEmpty else {
            throw ExecutorError.invalidRequest("contacts.delete_person requires 'personId' parameter")
        }
        return """
        tell application id "\(bundleId)"
            set p to person id "\(esc(personId))"
            set pName to first name of p & " " & last name of p
            delete p
            save
            return "{\\"deleted\\":true,\\"name\\":\\"" & my jsonEsc(pName) & "\\"}"
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
