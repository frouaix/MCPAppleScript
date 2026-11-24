import EventKit
import Foundation
import AppKit

struct Request: Decodable {
    let operation: String
    let calendarId: String?
    let startDate: String?
    let endDate: String?
    let timeZone: String?
    let limit: Int?
    let offset: Int?
    let eventId: String?
    let query: String?
    let calendarName: String?
    let title: String?
    let location: String?
    let notes: String?
    let allDay: Bool?
    let listId: String?
    let reminderId: String?
    let name: String?
    let body: String?
    let dueDate: String?
    let priority: Int?
    let completed: Bool?
}

struct EventReference: Codable {
    let eventIdentifier: String
    let calendarIdentifier: String
    let startInterval: Double
}

struct Failure: Error, LocalizedError {
    let message: String
    var errorDescription: String? { message }
}

func fail(_ message: String) throws -> Never {
    throw Failure(message: message)
}

let formatter: ISO8601DateFormatter = {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime]
    formatter.timeZone = TimeZone(secondsFromGMT: 0)
    return formatter
}()

func formatEventDate(_ date: Date, in timeZone: TimeZone) -> String {
    let output = ISO8601DateFormatter()
    output.formatOptions = [.withInternetDateTime]
    output.timeZone = timeZone
    return output.string(from: date)
}

func eventData(_ event: EKEvent) throws -> [String: Any] {
    guard let eventIdentifier = event.eventIdentifier else { try fail("Calendar event has no identifier.") }
    let reference = EventReference(
        eventIdentifier: eventIdentifier,
        calendarIdentifier: event.calendar.calendarIdentifier,
        startInterval: event.startDate.timeIntervalSince1970
    )
    let encoder = JSONEncoder()
    encoder.outputFormatting = .sortedKeys
    let id = try encoder.encode(reference).base64EncodedString()
    return [
        "id": id,
        "name": event.title ?? "",
        "type": "event",
        "calendarId": event.calendar.calendarIdentifier,
        "calendarName": event.calendar.title,
        "startDate": formatEventDate(event.startDate, in: .current),
        "endDate": formatEventDate(event.endDate, in: .current),
        "timeZone": TimeZone.current.identifier,
        "location": event.location ?? "",
        "allDay": event.isAllDay,
        "isRecurring": event.hasRecurrenceRules || event.isDetached,
    ]
}

func eventResource(_ data: [String: Any], description: String) -> [String: Any] {
    var result = data
    var properties = data.filter { ["startDate", "endDate", "location", "allDay"].contains($0.key) }
    properties["description"] = description
    result["properties"] = properties
    return result
}

func findEvent(_ id: String?, store: EKEventStore) throws -> EKEvent {
    guard let id = id, let data = Data(base64Encoded: id),
          let reference = try? JSONDecoder().decode(EventReference.self, from: data),
          reference.startInterval.isFinite,
          let calendar = store.calendars(for: .event).first(where: {
              $0.calendarIdentifier == reference.calendarIdentifier
          }) else {
        try fail("Invalid or unavailable Calendar event ID; list events again.")
    }
    let start = Date(timeIntervalSince1970: reference.startInterval)
    let predicate = store.predicateForEvents(withStart: start.addingTimeInterval(-1), end: start.addingTimeInterval(1), calendars: [calendar])
    let matches = store.events(matching: predicate).filter {
        $0.eventIdentifier == reference.eventIdentifier &&
        abs($0.startDate.timeIntervalSince1970 - reference.startInterval) < 0.001
    }
    guard matches.count == 1, let event = matches.first else {
        try fail("Calendar event occurrence not found or ambiguous; list events again.")
    }
    return event
}

func parseDate(_ text: String?, field: String) throws -> Date {
    guard let text = text, let value = formatter.date(from: text) else {
        try fail("\(field) must be an ISO 8601 timestamp with seconds and a UTC offset.")
    }
    return value
}

func validate(_ request: Request) throws {
    let operations = ["calendar.list_calendars", "calendar.list_events", "calendar.search_events",
                      "calendar.get_event", "calendar.create_event", "calendar.update_event",
                      "calendar.delete_event", "calendar.show"]
    guard operations.contains(request.operation) else { try fail("Unsupported Calendar operation.") }
    if request.operation == "calendar.list_events" || request.operation == "calendar.search_events" {
        let start = try parseDate(request.startDate, field: "startDate")
        let end = try parseDate(request.endDate, field: "endDate")
        guard end > start, end.timeIntervalSince(start) <= 3 * 366 * 24 * 60 * 60 else {
            try fail("Calendar range must be positive and no longer than three years.")
        }
        guard (1...200).contains(request.limit ?? 50), (request.offset ?? 0) >= 0 else {
            try fail("Invalid Calendar pagination.")
        }
        if request.operation == "calendar.search_events" && (request.query?.isEmpty ?? true) {
            try fail("Search query is required.")
        }
    }
    if ["calendar.get_event", "calendar.update_event", "calendar.delete_event"].contains(request.operation) {
        guard let id = request.eventId, let data = Data(base64Encoded: id),
              let reference = try? JSONDecoder().decode(EventReference.self, from: data),
              reference.startInterval.isFinite else {
            try fail("Invalid Calendar event ID; list events again.")
        }
    }
    if request.operation == "calendar.create_event" {
        guard let title = request.title, !title.isEmpty else { try fail("Event title is required.") }
        let start = try parseDate(request.startDate, field: "startDate")
        let end = try parseDate(request.endDate, field: "endDate")
        guard end > start else { try fail("endDate must follow startDate.") }
    }
}

func execute(_ request: Request, store: EKEventStore) throws -> Any {
    switch request.operation {
    case "calendar.list_calendars":
        return store.calendars(for: .event).map {
            ["id": $0.calendarIdentifier, "name": $0.title, "type": "calendar"]
        }
    case "calendar.list_events", "calendar.search_events":
        guard let startText = request.startDate, let endText = request.endDate,
              let start = formatter.date(from: startText), let end = formatter.date(from: endText),
              end > start else {
            try fail("Calendar reads require startDate and endDate; use calendar.list_events with a day or explicit range.")
        }
        guard end.timeIntervalSince(start) <= 3 * 366 * 24 * 60 * 60 else {
            try fail("Calendar date ranges cannot exceed three years.")
        }
        let calendars: [EKCalendar]?
        if let id = request.calendarId, !id.isEmpty {
            guard let calendar = store.calendars(for: .event).first(where: { $0.calendarIdentifier == id }) else {
                try fail("Calendar not found; get an ID from calendar.list_calendars.")
            }
            calendars = [calendar]
        } else {
            calendars = nil
        }
        let limit = request.limit ?? (request.operation == "calendar.search_events" ? 20 : 50)
        let offset = request.offset ?? 0
        guard (1...200).contains(limit), offset >= 0 else {
            try fail("Invalid Calendar pagination.")
        }
        let predicate = store.predicateForEvents(withStart: start, end: end, calendars: calendars)
        var events = store.events(matching: predicate).filter {
            $0.startDate < end && $0.endDate > start
        }
        if request.operation == "calendar.search_events" {
            guard let query = request.query, !query.isEmpty else { try fail("Search query is required.") }
            events = events.filter { ($0.title ?? "").localizedCaseInsensitiveContains(query) }
        }
        events.sort {
            if $0.startDate != $1.startDate { return $0.startDate < $1.startDate }
            return ($0.eventIdentifier ?? "") < ($1.eventIdentifier ?? "")
        }
        let pageStart = min(offset, events.count)
        let pageEnd = pageStart + min(limit, events.count - pageStart)
        return [
            "total": events.count,
            "offset": offset,
            "hasMore": pageEnd < events.count,
            "timeZone": TimeZone.current.identifier,
            "startDate": startText,
            "endDate": endText,
            "limitations": ["EventKit may expose fewer calendars than the Calendar app; compare calendar.list_calendars with Calendar."],
            "items": try events[pageStart..<pageEnd].map(eventData),
        ]
    case "calendar.get_event":
        let event = try findEvent(request.eventId, store: store)
        return eventResource(try eventData(event), description: event.notes ?? "")
    case "calendar.create_event":
        guard let title = request.title, !title.isEmpty else { try fail("Event title is required.") }
        let start = try parseDate(request.startDate, field: "startDate")
        let end = try parseDate(request.endDate, field: "endDate")
        guard end > start else { try fail("endDate must follow startDate.") }
        let calendar: EKCalendar
        if let id = request.calendarName, !id.isEmpty {
            guard let found = store.calendars(for: .event).first(where: { $0.calendarIdentifier == id }) else {
                try fail("Calendar not found; get an ID from calendar.list_calendars.")
            }
            calendar = found
        } else {
            guard let found = store.defaultCalendarForNewEvents else { try fail("No default calendar is available.") }
            calendar = found
        }
        let event = EKEvent(eventStore: store)
        event.calendar = calendar
        event.title = title
        event.startDate = start
        event.endDate = end
        event.location = request.location
        event.notes = request.notes
        event.isAllDay = request.allDay ?? false
        try store.save(event, span: .thisEvent)
        return try eventData(event)
    case "calendar.update_event":
        let event = try findEvent(request.eventId, store: store)
        guard request.title != nil || request.startDate != nil || request.endDate != nil ||
              request.location != nil || request.notes != nil || request.allDay != nil else {
            try fail("At least one event property is required.")
        }
        if let title = request.title { event.title = title }
        if request.startDate != nil { event.startDate = try parseDate(request.startDate, field: "startDate") }
        if request.endDate != nil { event.endDate = try parseDate(request.endDate, field: "endDate") }
        if let location = request.location { event.location = location }
        if let notes = request.notes { event.notes = notes }
        if let allDay = request.allDay { event.isAllDay = allDay }
        guard event.endDate > event.startDate else { try fail("endDate must follow startDate.") }
        try store.save(event, span: .thisEvent)
        return try eventData(event)
    case "calendar.delete_event":
        let event = try findEvent(request.eventId, store: store)
        let title = event.title ?? ""
        try store.remove(event, span: .thisEvent)
        return ["deleted": true, "name": title]
    default:
        try fail("Unsupported Calendar read operation.")
    }
}

#if !CALENDAR_BRIDGE_TEST
@main
struct CalendarBridge {
    static func main() async {
        do {
            let request = try JSONDecoder().decode(Request.self, from: FileHandle.standardInput.readDataToEndOfFile())
            if request.operation.hasPrefix("reminders.") {
                let result = try await executeRemindersRequest(request)
                let data = try JSONSerialization.data(withJSONObject: result, options: [.fragmentsAllowed])
                FileHandle.standardOutput.write(data)
                return
            }
            try validate(request)
            if request.operation == "calendar.show" {
                guard let url = NSWorkspace.shared.urlForApplication(withBundleIdentifier: "com.apple.iCal") else {
                    try fail("Calendar app not found.")
                }
                _ = try await NSWorkspace.shared.openApplication(at: url, configuration: NSWorkspace.OpenConfiguration())
                FileHandle.standardOutput.write(Data("{\"shown\":true}".utf8))
                return
            }
            let store = EKEventStore()
            let granted: Bool
            if #available(macOS 14.0, *) {
                granted = try await store.requestFullAccessToEvents()
            } else {
                granted = try await withCheckedThrowingContinuation { continuation in
                    store.requestAccess(to: .event) { granted, error in
                        if let error = error { continuation.resume(throwing: error) }
                        else { continuation.resume(returning: granted) }
                    }
                }
            }
            guard granted else {
                try fail("Calendar access denied. Enable Full Access for the Calendar Bridge in System Settings > Privacy & Security > Calendars.")
            }
            let data = try JSONSerialization.data(withJSONObject: execute(request, store: store), options: [.fragmentsAllowed])
            FileHandle.standardOutput.write(data)
        } catch {
            let message = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
            FileHandle.standardError.write(Data((message + "\n").utf8))
            exit(1)
        }
    }
}
#endif
