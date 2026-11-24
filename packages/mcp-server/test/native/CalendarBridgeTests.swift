import Foundation

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
    }
}
