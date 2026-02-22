import Foundation

/// AppleScript templates for Apple Calendar.
enum CalendarTemplates {
    static func build(templateId: String, bundleId: String, parameters: [String: Any]) throws -> String {
        switch templateId {
        case "calendar.list_calendars":
            return buildListCalendars(bundleId: bundleId)
        case "calendar.list_events":
            return buildListEvents(bundleId: bundleId, parameters: parameters)
        case "calendar.get_event":
            return try buildGetEvent(bundleId: bundleId, parameters: parameters)
        case "calendar.search_events":
            return try buildSearchEvents(bundleId: bundleId, parameters: parameters)
        case "calendar.create_event":
            return try buildCreateEvent(bundleId: bundleId, parameters: parameters)
        case "calendar.update_event":
            return try buildUpdateEvent(bundleId: bundleId, parameters: parameters)
        case "calendar.delete_event":
            return try buildDeleteEvent(bundleId: bundleId, parameters: parameters)
        case "calendar.show":
            return buildShow(bundleId: bundleId, parameters: parameters)
        default:
            throw ExecutorError.invalidRequest("Unknown calendar template: \(templateId)")
        }
    }

    // MARK: - Readonly

    private static func buildListCalendars(bundleId: String) -> String {
        """
        tell application id "\(bundleId)"
            set calList to {}
            repeat with c in calendars
                set end of calList to {calId:uid of c, calName:name of c, calColor:color of c}
            end repeat
            set output to "["
            repeat with i from 1 to count of calList
                set c to item i of calList
                set output to output & "{\\"id\\":\\"" & my jsonEsc(calId of c) & "\\",\\"name\\":\\"" & my jsonEsc(calName of c) & "\\",\\"type\\":\\"calendar\\"}"
                if i < (count of calList) then set output to output & ","
            end repeat
            set output to output & "]"
            return output
        end tell
        """
    }

    private static func buildListEvents(bundleId: String, parameters: [String: Any]) -> String {
        let calendarId = parameters["calendarId"] as? String ?? ""
        let limit = parameters["limit"] as? Int ?? 50

        let targetClause: String
        if !calendarId.isEmpty {
            targetClause = "events of (first calendar whose uid is \"\(esc(calendarId))\")"
        } else {
            targetClause = "events of calendars"
        }

        return """
        tell application id "\(bundleId)"
            set allEvents to \(targetClause)
            set totalCount to count of allEvents
            set resultCount to totalCount
            if resultCount > \(limit) then set resultCount to \(limit)
            set output to "{\\"total\\":" & (totalCount as text) & ",\\"items\\":["
            repeat with i from 1 to resultCount
                set e to item i of allEvents
                set eId to uid of e
                set eSummary to summary of e
                set eStart to start date of e as «class isot» as string
                set eEnd to end date of e as «class isot» as string
                set output to output & "{\\"id\\":\\"" & my jsonEsc(eId) & "\\",\\"name\\":\\"" & my jsonEsc(eSummary) & "\\",\\"type\\":\\"event\\",\\"properties\\":{\\"startDate\\":\\"" & my jsonEsc(eStart) & "\\",\\"endDate\\":\\"" & my jsonEsc(eEnd) & "\\"}}"
                if i < resultCount then set output to output & ","
            end repeat
            set output to output & "]}"
            return output
        end tell
        """
    }

    private static func buildGetEvent(bundleId: String, parameters: [String: Any]) throws -> String {
        guard let eventId = parameters["eventId"] as? String, !eventId.isEmpty else {
            throw ExecutorError.invalidRequest("calendar.get_event requires 'eventId' parameter")
        }
        return """
        tell application id "\(bundleId)"
            set matchingEvents to (events of calendars whose uid is "\(esc(eventId))")
            set flatEvents to {}
            repeat with calEvents in matchingEvents
                repeat with e in calEvents
                    set end of flatEvents to e
                end repeat
            end repeat
            if (count of flatEvents) is 0 then error "Event not found: \(esc(eventId))"
            set e to item 1 of flatEvents
            set eId to uid of e
            set eSummary to summary of e
            set eStart to start date of e as «class isot» as string
            set eEnd to end date of e as «class isot» as string
            set eLoc to location of e
            set eDesc to description of e
            set eAllDay to allday event of e
            return "{\\"id\\":\\"" & my jsonEsc(eId) & "\\",\\"name\\":\\"" & my jsonEsc(eSummary) & "\\",\\"type\\":\\"event\\",\\"properties\\":{\\"startDate\\":\\"" & my jsonEsc(eStart) & "\\",\\"endDate\\":\\"" & my jsonEsc(eEnd) & "\\",\\"location\\":\\"" & my jsonEsc(eLoc) & "\\",\\"description\\":\\"" & my jsonEsc(eDesc) & "\\",\\"allDay\\":" & eAllDay & "}}"
        end tell
        """
    }

    private static func buildSearchEvents(bundleId: String, parameters: [String: Any]) throws -> String {
        guard let query = parameters["query"] as? String, !query.isEmpty else {
            throw ExecutorError.invalidRequest("calendar.search_events requires 'query' parameter")
        }
        let limit = parameters["limit"] as? Int ?? 20

        return """
        tell application id "\(bundleId)"
            set matchingEvents to {}
            repeat with c in calendars
                repeat with e in (events of c whose summary contains "\(esc(query))")
                    set end of matchingEvents to e
                end repeat
            end repeat
            set resultCount to count of matchingEvents
            if resultCount > \(limit) then set resultCount to \(limit)
            set output to "["
            repeat with i from 1 to resultCount
                set e to item i of matchingEvents
                set eId to uid of e
                set eSummary to summary of e
                set eStart to start date of e as «class isot» as string
                set output to output & "{\\"id\\":\\"" & my jsonEsc(eId) & "\\",\\"name\\":\\"" & my jsonEsc(eSummary) & "\\",\\"type\\":\\"event\\",\\"properties\\":{\\"startDate\\":\\"" & my jsonEsc(eStart) & "\\"}}"
                if i < resultCount then set output to output & ","
            end repeat
            set output to output & "]"
            return output
        end tell
        """
    }

    // MARK: - Create

    private static func buildCreateEvent(bundleId: String, parameters: [String: Any]) throws -> String {
        guard let title = parameters["title"] as? String, !title.isEmpty else {
            throw ExecutorError.invalidRequest("calendar.create_event requires 'title' parameter")
        }
        guard let startDate = parameters["startDate"] as? String, !startDate.isEmpty else {
            throw ExecutorError.invalidRequest("calendar.create_event requires 'startDate' parameter")
        }
        guard let endDate = parameters["endDate"] as? String, !endDate.isEmpty else {
            throw ExecutorError.invalidRequest("calendar.create_event requires 'endDate' parameter")
        }
        let calendarName = esc(parameters["calendarName"] as? String ?? "Calendar")
        let location = esc(parameters["location"] as? String ?? "")
        let notes = esc(parameters["notes"] as? String ?? "")
        let allDay = parameters["allDay"] as? Bool ?? false

        return """
        tell application id "\(bundleId)"
            set targetCalendar to first calendar whose name is "\(calendarName)"
            set startDate to date "\(esc(startDate))"
            set endDate to date "\(esc(endDate))"
            set newEvent to make new event at end of events of targetCalendar with properties {summary:"\(esc(title))", start date:startDate, end date:endDate, location:"\(location)", description:"\(notes)", allday event:\(allDay)}
            set eId to uid of newEvent
            return "{\\"id\\":\\"" & my jsonEsc(eId) & "\\",\\"name\\":\\"\(esc(title))\\",\\"type\\":\\"event\\"}"
        end tell
        """
    }

    // MARK: - Full

    private static func buildUpdateEvent(bundleId: String, parameters: [String: Any]) throws -> String {
        guard let eventId = parameters["eventId"] as? String, !eventId.isEmpty else {
            throw ExecutorError.invalidRequest("calendar.update_event requires 'eventId' parameter")
        }
        var setStatements: [String] = []
        if let title = parameters["title"] as? String {
            setStatements.append("set summary of e to \"\(esc(title))\"")
        }
        if let location = parameters["location"] as? String {
            setStatements.append("set location of e to \"\(esc(location))\"")
        }
        if let notes = parameters["notes"] as? String {
            setStatements.append("set description of e to \"\(esc(notes))\"")
        }
        if let startDate = parameters["startDate"] as? String {
            setStatements.append("set start date of e to date \"\(esc(startDate))\"")
        }
        if let endDate = parameters["endDate"] as? String {
            setStatements.append("set end date of e to date \"\(esc(endDate))\"")
        }
        if setStatements.isEmpty {
            throw ExecutorError.invalidRequest("calendar.update_event requires at least one property to update")
        }
        return """
        tell application id "\(bundleId)"
            set matchingEvents to (events of calendars whose uid is "\(esc(eventId))")
            set flatEvents to {}
            repeat with calEvents in matchingEvents
                repeat with ev in calEvents
                    set end of flatEvents to ev
                end repeat
            end repeat
            if (count of flatEvents) is 0 then error "Event not found: \(esc(eventId))"
            set e to item 1 of flatEvents
            \(setStatements.joined(separator: "\n            "))
            return "{\\"id\\":\\"" & my jsonEsc(uid of e) & "\\",\\"name\\":\\"" & my jsonEsc(summary of e) & "\\",\\"type\\":\\"event\\"}"
        end tell
        """
    }

    private static func buildDeleteEvent(bundleId: String, parameters: [String: Any]) throws -> String {
        guard let eventId = parameters["eventId"] as? String, !eventId.isEmpty else {
            throw ExecutorError.invalidRequest("calendar.delete_event requires 'eventId' parameter")
        }
        return """
        tell application id "\(bundleId)"
            set matchingEvents to (events of calendars whose uid is "\(esc(eventId))")
            set flatEvents to {}
            repeat with calEvents in matchingEvents
                repeat with ev in calEvents
                    set end of flatEvents to ev
                end repeat
            end repeat
            if (count of flatEvents) is 0 then error "Event not found: \(esc(eventId))"
            set e to item 1 of flatEvents
            set eName to summary of e
            delete e
            return "{\\"deleted\\":true,\\"name\\":\\"" & my jsonEsc(eName) & "\\"}"
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

    private static func esc(_ s: String) -> String {
        s.replacingOccurrences(of: "\\", with: "\\\\")
         .replacingOccurrences(of: "\"", with: "\\\"")
    }
}
