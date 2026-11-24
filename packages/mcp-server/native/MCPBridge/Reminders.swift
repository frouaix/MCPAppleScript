import AppKit
import EventKit
import Foundation

func reminderDueDate(_ text: String) throws -> DateComponents {
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = .current
    if text.range(of: #"^\d{4}-\d{2}-\d{2}$"#, options: .regularExpression) != nil {
        let parts = text.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3 else { try fail("Invalid reminder due date.") }
        var components = DateComponents()
        components.calendar = calendar
        components.year = parts[0]
        components.month = parts[1]
        components.day = parts[2]
        guard let date = calendar.date(from: components),
              calendar.dateComponents([.year, .month, .day], from: date).year == parts[0],
              calendar.component(.month, from: date) == parts[1],
              calendar.component(.day, from: date) == parts[2] else {
            try fail("Invalid reminder due date.")
        }
        return components
    }
    let date = try parseDate(text, field: "dueDate")
    calendar.timeZone = TimeZone(secondsFromGMT: 0)!
    var components = calendar.dateComponents([.year, .month, .day, .hour, .minute, .second], from: date)
    components.calendar = calendar
    components.timeZone = calendar.timeZone
    return components
}

func reminderDueInstant(_ due: DateComponents?) throws -> Date? {
    guard let due = due else { return nil }
    guard due.year != nil, due.month != nil, due.day != nil else {
        try fail("Could not represent reminder due date.")
    }
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = due.hour == nil ? .current : (due.timeZone ?? .current)
    var components = due
    components.calendar = calendar
    if due.hour == nil { components.timeZone = calendar.timeZone }
    guard let date = calendar.date(from: components) else {
        try fail("Could not represent reminder due date.")
    }
    return date
}

func reminderMatchesDueRange(_ due: DateComponents?, completed: Bool, start: Date, end: Date) throws -> Bool {
    guard !completed, let date = try reminderDueInstant(due) else { return false }
    return date >= start && date < end
}

func reminderData(_ reminder: EKReminder) throws -> [String: Any] {
    var properties: [String: Any] = [
        "body": reminder.notes ?? "",
        "completed": reminder.isCompleted,
        "priority": reminder.priority,
    ]
    if let due = reminder.dueDateComponents {
        if due.hour == nil, let year = due.year, let month = due.month, let day = due.day {
            properties["dueDate"] = String(format: "%04d-%02d-%02d", year, month, day)
        } else {
            let calendar = due.calendar ?? Calendar.current
            guard let date = calendar.date(from: due) else {
                try fail("Could not represent reminder due date.")
            }
            properties["dueDate"] = formatEventDate(date, in: .current)
        }
    }
    var result: [String: Any] = [
        "id": reminder.calendarItemIdentifier,
        "name": reminder.title ?? "",
        "type": "reminder",
        "containerId": reminder.calendar.calendarIdentifier,
        "containerName": reminder.calendar.title,
        "properties": properties,
    ]
    if let date = reminder.creationDate { result["createdAt"] = formatEventDate(date, in: .current) }
    if let date = reminder.lastModifiedDate { result["modifiedAt"] = formatEventDate(date, in: .current) }
    return result
}

func validateReminderRequest(_ request: Request) throws {
    let supported = ["reminders.list_lists", "reminders.list_reminders", "reminders.list_due", "reminders.get_reminder",
                     "reminders.search_reminders", "reminders.create_reminder", "reminders.update_reminder",
                     "reminders.delete_reminder", "reminders.complete", "reminders.show"]
    guard supported.contains(request.operation) else { try fail("Unsupported Reminders operation.") }
    if ["reminders.get_reminder", "reminders.update_reminder", "reminders.delete_reminder", "reminders.complete"].contains(request.operation) {
        guard let id = request.reminderId, !id.isEmpty else { try fail("reminderId is required.") }
    }
    if request.operation == "reminders.create_reminder" {
        guard let name = request.name, !name.isEmpty else { try fail("Reminder name is required.") }
    }
    if request.operation == "reminders.update_reminder" {
        guard request.name != nil || request.body != nil || request.dueDate != nil ||
              request.priority != nil || request.completed != nil else {
            try fail("At least one reminder property is required.")
        }
    }
    if let name = request.name, name.isEmpty { try fail("Reminder name cannot be empty.") }
    if let priority = request.priority, !(0...9).contains(priority) { try fail("Reminder priority must be between 0 and 9.") }
    if let due = request.dueDate { _ = try reminderDueDate(due) }
    if request.operation == "reminders.search_reminders" && (request.query?.isEmpty ?? true) {
        try fail("Search query is required.")
    }
    if request.operation == "reminders.list_due" {
        let start = try parseDate(request.startDate, field: "startDate")
        let end = try parseDate(request.endDate, field: "endDate")
        guard end > start, end.timeIntervalSince(start) <= 26 * 60 * 60 else {
            try fail("Reminders due range must be a single local day.")
        }
    }
    if !(1...200).contains(request.limit ?? 50) || (request.offset ?? 0) < 0 {
        try fail("Invalid Reminders pagination.")
    }
}

func fetchReminders(_ store: EKEventStore, predicate: NSPredicate) async throws -> [EKReminder] {
    return try await withCheckedThrowingContinuation { continuation in
        store.fetchReminders(matching: predicate) { reminders in
            guard let reminders = reminders else {
                continuation.resume(throwing: Failure(message: "Could not fetch reminders."))
                return
            }
            continuation.resume(returning: reminders)
        }
    }
}

func executeRemindersRequest(_ request: Request) async throws -> Any {
    try validateReminderRequest(request)
    if request.operation == "reminders.show" {
        guard let url = NSWorkspace.shared.urlForApplication(withBundleIdentifier: "com.apple.reminders") else {
            try fail("Reminders app not found.")
        }
        _ = try await NSWorkspace.shared.openApplication(at: url, configuration: NSWorkspace.OpenConfiguration())
        return ["shown": true]
    }
    let store = EKEventStore()
    let granted: Bool
    if #available(macOS 14.0, *) {
        granted = try await store.requestFullAccessToReminders()
    } else {
        granted = try await withCheckedThrowingContinuation { continuation in
            store.requestAccess(to: .reminder) { granted, error in
                if let error = error { continuation.resume(throwing: error) }
                else { continuation.resume(returning: granted) }
            }
        }
    }
    guard granted else {
        try fail("Reminders access denied. Enable Full Access for MCPBridge in System Settings > Privacy & Security > Reminders.")
    }
    return try await executeReminders(request, store: store)
}

func executeReminders(_ request: Request, store: EKEventStore) async throws -> Any {
    let calendars = store.calendars(for: .reminder)
    switch request.operation {
    case "reminders.list_lists":
        return calendars.map { ["id": $0.calendarIdentifier, "name": $0.title, "type": "list"] }
    case "reminders.list_reminders", "reminders.search_reminders", "reminders.list_due":
        var selected: [EKCalendar]?
        if let id = request.listId, !id.isEmpty {
            guard let list = calendars.first(where: { $0.calendarIdentifier == id }) else {
                try fail("Reminder list not found; get an ID from app.list_containers.")
            }
            selected = [list]
        }
        let rangeStart: Date?
        let rangeEnd: Date?
        let predicate: NSPredicate
        if request.operation == "reminders.list_due" {
            let start = try parseDate(request.startDate, field: "startDate")
            let end = try parseDate(request.endDate, field: "endDate")
            rangeStart = start
            rangeEnd = end
            // Widen the EventKit query for floating and cross-zone due dates, then filter locally.
            predicate = store.predicateForIncompleteReminders(
                withDueDateStarting: start.addingTimeInterval(-2 * 86400),
                ending: end.addingTimeInterval(2 * 86400),
                calendars: selected
            )
        } else {
            rangeStart = nil
            rangeEnd = nil
            predicate = store.predicateForReminders(in: selected)
        }
        var reminders = try await fetchReminders(store, predicate: predicate)
        if let start = rangeStart, let end = rangeEnd {
            reminders = try reminders.filter {
                try reminderMatchesDueRange($0.dueDateComponents, completed: $0.isCompleted, start: start, end: end)
            }
        }
        if request.operation == "reminders.search_reminders", let query = request.query {
            reminders = reminders.filter { ($0.title ?? "").localizedCaseInsensitiveContains(query) }
        }
        if rangeStart != nil {
            let dates = try reminders.map { reminder -> (EKReminder, Date) in
                guard let date = try reminderDueInstant(reminder.dueDateComponents) else {
                    try fail("Could not represent reminder due date.")
                }
                return (reminder, date)
            }
            reminders = dates.sorted {
                if $0.1 != $1.1 { return $0.1 < $1.1 }
                return $0.0.calendarItemIdentifier < $1.0.calendarItemIdentifier
            }.map { $0.0 }
        } else {
            reminders.sort {
                let comparison = ($0.title ?? "").localizedStandardCompare($1.title ?? "")
                return comparison == .orderedSame ? $0.calendarItemIdentifier < $1.calendarItemIdentifier : comparison == .orderedAscending
            }
        }
        let offset = request.offset ?? 0
        let start = min(offset, reminders.count)
        let end = start + min(request.limit ?? 50, reminders.count - start)
        var result: [String: Any] = ["total": reminders.count, "offset": offset, "hasMore": end < reminders.count,
                                     "items": try reminders[start..<end].map(reminderData)]
        if rangeStart != nil {
            result["startDate"] = request.startDate
            result["endDate"] = request.endDate
            result["timeZone"] = TimeZone.current.identifier
        }
        return result
    case "reminders.create_reminder", "reminders.update_reminder", "reminders.get_reminder",
         "reminders.delete_reminder", "reminders.complete":
        let reminder: EKReminder
        if request.operation == "reminders.create_reminder" {
            reminder = EKReminder(eventStore: store)
            if let id = request.listId, !id.isEmpty {
                guard let list = calendars.first(where: { $0.calendarIdentifier == id }) else {
                    try fail("Reminder list not found; get an ID from app.list_containers.")
                }
                reminder.calendar = list
            } else {
                guard let list = store.defaultCalendarForNewReminders() else {
                    try fail("No default reminder list is available.")
                }
                reminder.calendar = list
            }
        } else {
            guard let id = request.reminderId, let found = store.calendarItem(withIdentifier: id) as? EKReminder else {
                try fail("Reminder not found; list reminders again.")
            }
            reminder = found
        }
        if request.operation == "reminders.get_reminder" { return try reminderData(reminder) }
        if request.operation == "reminders.delete_reminder" {
            let name = reminder.title ?? ""
            try store.remove(reminder, commit: true)
            return ["deleted": true, "name": name]
        }
        if request.operation == "reminders.complete" {
            reminder.isCompleted = true
        } else {
            if let name = request.name { reminder.title = name }
            if let body = request.body { reminder.notes = body }
            if let priority = request.priority { reminder.priority = priority }
            if let completed = request.completed { reminder.isCompleted = completed }
            if let due = request.dueDate { reminder.dueDateComponents = try reminderDueDate(due) }
        }
        try store.save(reminder, commit: true)
        return try reminderData(reminder)
    default:
        try fail("Unsupported Reminders operation.")
    }
}
