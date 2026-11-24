import Foundation
import Contacts

@main
struct CalendarBridgeTests {
    static func main() throws {
        let zone = TimeZone(identifier: "America/Los_Angeles")!
        let before = formatter.date(from: "2026-03-08T09:30:00Z")!
        let after = formatter.date(from: "2026-03-08T10:30:00Z")!
        precondition(formatEventDate(before, in: zone) == "2026-03-08T01:30:00-08:00")
        precondition(formatEventDate(after, in: zone) == "2026-03-08T03:30:00-07:00")

        let event: [String: Any] = [
            "id": "fixture", "type": "event",
            "startDate": "2026-03-08T01:30:00-08:00",
            "endDate": "2026-03-08T03:30:00-07:00",
            "location": "Office", "allDay": false,
        ]
        let resource = eventResource(event, description: "Agenda")
        let serialized = try JSONSerialization.data(withJSONObject: resource)
        let decodedResource = try JSONSerialization.jsonObject(with: serialized) as! [String: Any]
        let properties = decodedResource["properties"] as! [String: Any]
        precondition(properties["startDate"] as? String == event["startDate"] as? String)
        precondition(properties["endDate"] as? String == event["endDate"] as? String)
        precondition(properties["location"] as? String == "Office")
        precondition(properties["allDay"] as? Bool == false)
        precondition(properties["description"] as? String == "Agenda")
        precondition(decodedResource["startDate"] as? String == event["startDate"] as? String)

        let reference = EventReference(eventIdentifier: "series", calendarIdentifier: "calendar", startInterval: 100.25)
        let id = try JSONEncoder().encode(reference).base64EncodedString()
        let request = try JSONDecoder().decode(Request.self, from: Data("{\"operation\":\"calendar.get_event\",\"eventId\":\"\(id)\"}".utf8))
        try validate(request)
        let decoded = try JSONDecoder().decode(EventReference.self, from: Data(base64Encoded: id)!)
        precondition(decoded.eventIdentifier == "series" && decoded.calendarIdentifier == "calendar" && decoded.startInterval == 100.25)
        let invalid = try JSONDecoder().decode(Request.self, from: Data("{\"operation\":\"calendar.delete_event\",\"eventId\":\"bad\"}".utf8))
        do {
            try validate(invalid)
            fatalError("Invalid event ID accepted")
        } catch { }

        let allDay = try reminderDueDate("2026-11-24")
        precondition(allDay.year == 2026 && allDay.month == 11 && allDay.day == 24 && allDay.hour == nil)
        let timed = try reminderDueDate("2026-11-24T10:30:00-08:00")
        precondition(timed.date == formatter.date(from: "2026-11-24T18:30:00Z"))
        precondition(TimeZone.current.secondsFromGMT(for: formatter.date(from: "2026-11-01T08:30:00Z")!) == -7 * 3600)
        let firstFallHour = try reminderDueDate("2026-11-01T01:30:00-07:00")
        let secondFallHour = try reminderDueDate("2026-11-01T01:30:00-08:00")
        precondition(firstFallHour.date == formatter.date(from: "2026-11-01T08:30:00Z"))
        precondition(secondFallHour.date == formatter.date(from: "2026-11-01T09:30:00Z"))
        var localCalendar = Calendar(identifier: .gregorian)
        localCalendar.timeZone = .current
        let dayStart = localCalendar.startOfDay(for: try reminderDueInstant(allDay)!)
        let nextDay = localCalendar.date(byAdding: .day, value: 1, to: dayStart)!
        let matchesToday = try reminderMatchesDueRange(allDay, completed: false, start: dayStart, end: nextDay)
        let completedMatches = try reminderMatchesDueRange(allDay, completed: true, start: dayStart, end: nextDay)
        let missingMatches = try reminderMatchesDueRange(nil, completed: false, start: dayStart, end: nextDay)
        precondition(matchesToday && !completedMatches && !missingMatches)
        let nextDayComponents = localCalendar.dateComponents([.year, .month, .day, .hour, .minute], from: nextDay)
        let nextMatches = try reminderMatchesDueRange(nextDayComponents, completed: false, start: dayStart, end: nextDay)
        precondition(!nextMatches)
        let beforeDay = localCalendar.dateComponents([.year, .month, .day, .hour, .minute], from: dayStart.addingTimeInterval(-60))
        let beforeMatches = try reminderMatchesDueRange(beforeDay, completed: false, start: dayStart, end: nextDay)
        precondition(!beforeMatches)
        var utcCalendar = Calendar(identifier: .gregorian)
        utcCalendar.timeZone = TimeZone(secondsFromGMT: 0)!
        var timedToday = utcCalendar.dateComponents([.year, .month, .day, .hour, .minute], from: dayStart.addingTimeInterval(36000))
        timedToday.timeZone = utcCalendar.timeZone
        let timedMatches = try reminderMatchesDueRange(timedToday, completed: false, start: dayStart, end: nextDay)
        precondition(timedMatches)
        do {
            _ = try reminderDueDate("2026-02-30")
            fatalError("Invalid due date accepted")
        } catch { }
        let badReminder = try JSONDecoder().decode(Request.self, from: Data("{\"operation\":\"reminders.update_reminder\",\"reminderId\":\"fixture\"}".utf8))
        do {
            try validateReminderRequest(badReminder)
            fatalError("Empty reminder update accepted")
        } catch { }

        let contactRequest = try JSONDecoder().decode(ContactsRequest.self, from: Data("""
        {"operation":"contacts.create_person","firstName":"Example","lastName":"Person",
         "emails":[{"label":"work","value":"one@example.test"},{"label":null,"value":"two@example.test"}],
         "phones":[{"label":"mobile","value":"123456"}]}
        """.utf8))
        try validateContactsRequest(contactRequest)
        let contact = CNMutableContact()
        applyContactChanges(contactRequest, to: contact)
        contact.middleName = "Middle"
        precondition(contactMatchesQuery(contact, query: "EXAMPLE"))
        precondition(contactMatchesQuery(contact, query: "middle"))
        precondition(contactMatchesQuery(contact, query: "Example Middle Person"))
        precondition(contactMatchesQuery(contact, query: "Example Person"))
        precondition(contactMatchesQuery(contact, query: "two@example"))
        precondition(contactMatchesQuery(contact, query: "123"))
        precondition(!contactMatchesQuery(contact, query: "not-present"))
        let detail = contactDetails(contact)
        let contactJson = try JSONSerialization.data(withJSONObject: detail)
        let decodedContact = try JSONSerialization.jsonObject(with: contactJson) as! [String: Any]
        let contactProperties = decodedContact["properties"] as! [String: Any]
        precondition(decodedContact["name"] as? String == "Example Person")
        precondition((contactProperties["emails"] as? [[String: Any]])?.count == 2)
        precondition((contactProperties["phones"] as? [[String: Any]])?.count == 1)
        let update = try JSONDecoder().decode(ContactsRequest.self, from: Data("""
        {"operation":"contacts.update_person","personId":"fixture","firstName":"Updated"}
        """.utf8))
        try validateContactsRequest(update)
        applyContactChanges(update, to: contact)
        precondition(contact.givenName == "Updated" && contact.emailAddresses.count == 2)
        let invalidContact = try JSONDecoder().decode(ContactsRequest.self, from: Data("""
        {"operation":"contacts.update_person","personId":"fixture"}
        """.utf8))
        do {
            try validateContactsRequest(invalidContact)
            fatalError("Empty contact update accepted")
        } catch { }
    }
}
