import { esc } from "./escape.js";

export function build(
  templateId: string,
  bundleId: string,
  parameters: Record<string, unknown>
): string {
  switch (templateId) {
    case "calendar.list_calendars":
      return buildListCalendars(bundleId);
    case "calendar.list_events":
      return buildListEvents(bundleId, parameters);
    case "calendar.get_event":
      return buildGetEvent(bundleId, parameters);
    case "calendar.search_events":
      return buildSearchEvents(bundleId, parameters);
    case "calendar.create_event":
      return buildCreateEvent(bundleId, parameters);
    case "calendar.update_event":
      return buildUpdateEvent(bundleId, parameters);
    case "calendar.delete_event":
      return buildDeleteEvent(bundleId, parameters);
    case "calendar.show":
      return buildShow(bundleId);
    default:
      throw new Error(`Unknown calendar template: ${templateId}`);
  }
}

function buildListCalendars(bundleId: string): string {
  return `tell application id "${bundleId}"
    set calList to {}
    repeat with c in calendars
        set end of calList to {calName:name of c}
    end repeat
    set output to "["
    repeat with i from 1 to count of calList
        set c to item i of calList
        set output to output & "{\\"id\\":\\"" & my jsonEsc(calName of c) & "\\",\\"name\\":\\"" & my jsonEsc(calName of c) & "\\",\\"type\\":\\"calendar\\"}"
        if i < (count of calList) then set output to output & ","
    end repeat
    set output to output & "]"
    return output
end tell`;
}

function buildListEvents(bundleId: string, parameters: Record<string, unknown>): string {
  const calendarId = (parameters["calendarId"] as string | undefined) ?? "";
  const limit = (parameters["limit"] as number | undefined) ?? 50;
  const offset = (parameters["offset"] as number | undefined) ?? 0;
  const startDate = parameters["startDate"] as string | undefined;
  const endDate = parameters["endDate"] as string | undefined;
  const timeZone =
    (parameters["timeZone"] as string | undefined) ??
    Intl.DateTimeFormat().resolvedOptions().timeZone;
  const calendarSelection = calendarId
    ? `set selectedCalendars to (every calendar whose name is "${esc(calendarId)}")
    if (count of selectedCalendars) is 0 then error "Calendar not found"
    if (count of selectedCalendars) > 1 then error "Calendar name is ambiguous; omit calendarId to query all calendars"`
    : "set selectedCalendars to calendars";
  const range = startDate && endDate;
  const eventQuery = range
    ? "every event of c whose start date < rangeEnd and end date > rangeStart"
    : "every event of c";

  return `use framework "Foundation"
use scripting additions
set isoFormatter to current application's NSISO8601DateFormatter's alloc()'s init()
${
  range
    ? `set rangeStart to (isoFormatter's dateFromString:"${esc(startDate)}") as date
set rangeEnd to (isoFormatter's dateFromString:"${esc(endDate)}") as date`
    : ""
}
set eventRows to current application's NSMutableArray's array()
tell application id "${bundleId}"
    ${calendarSelection}
    repeat with c in selectedCalendars
        set cName to name of c
        set matchingEvents to ${eventQuery}
        repeat with e in matchingEvents
            set eventStart to start date of e
            set eventEnd to end date of e
            set startText to (isoFormatter's stringFromDate:eventStart) as text
            set endText to (isoFormatter's stringFromDate:eventEnd) as text
            set eventLocation to location of e
            if eventLocation is missing value then set eventLocation to ""
            set eventRecurrence to recurrence of e
            if eventRecurrence is missing value then set eventRecurrence to ""
            set rowData to current application's NSDictionary's dictionaryWithObjects:{uid of e, summary of e, cName, cName, startText, endText, eventLocation, allday event of e, eventRecurrence} forKeys:{"id", "name", "calendarId", "calendarName", "startDate", "endDate", "location", "allDay", "recurrence"}
            eventRows's addObject:rowData
        end repeat
    end repeat
end tell
eventRows's sortUsingDescriptors:{current application's NSSortDescriptor's sortDescriptorWithKey:"startDate" ascending:true, current application's NSSortDescriptor's sortDescriptorWithKey:"id" ascending:true}
set totalCount to eventRows's |count|() as integer
set pageStart to ${offset}
if pageStart > totalCount then set pageStart to totalCount
set pageCount to totalCount - pageStart
if pageCount > ${limit} then set pageCount to ${limit}
set pageRows to eventRows's subarrayWithRange:{pageStart, pageCount}
set moreAvailable to (${offset} + pageCount < totalCount)
set resultData to current application's NSDictionary's dictionaryWithObjects:{totalCount, ${offset}, moreAvailable, "${esc(timeZone)}", {"Recurring events are not expanded into occurrences; this result is not a complete recurring schedule."}, pageRows} forKeys:{"total", "offset", "hasMore", "timeZone", "limitations", "items"}
set jsonData to current application's NSJSONSerialization's dataWithJSONObject:resultData options:0 |error|:(missing value)
if jsonData is missing value then error "Could not serialize Calendar events"
return (current application's NSString's alloc()'s initWithData:jsonData encoding:(current application's NSUTF8StringEncoding)) as text`;
}

function buildGetEvent(bundleId: string, parameters: Record<string, unknown>): string {
  const eventId = parameters["eventId"] as string | undefined;
  if (!eventId) throw new Error("calendar.get_event requires 'eventId' parameter");
  return `tell application id "${bundleId}"
    set matchingEvents to (events of calendars whose uid is "${esc(eventId)}")
    set flatEvents to {}
    repeat with calEvents in matchingEvents
        repeat with e in calEvents
            set end of flatEvents to e
        end repeat
    end repeat
    if (count of flatEvents) is 0 then error "Event not found: ${esc(eventId)}"
    set e to item 1 of flatEvents
    set eId to uid of e
    set eSummary to summary of e
    set eStart to start date of e as «class isot» as string
    set eEnd to end date of e as «class isot» as string
    set eLoc to location of e
    set eDesc to description of e
    set eAllDay to allday event of e
    return "{\\"id\\":\\"" & my jsonEsc(eId) & "\\",\\"name\\":\\"" & my jsonEsc(eSummary) & "\\",\\"type\\":\\"event\\",\\"properties\\":{\\"startDate\\":\\"" & my jsonEsc(eStart) & "\\",\\"endDate\\":\\"" & my jsonEsc(eEnd) & "\\",\\"location\\":\\"" & my jsonEsc(eLoc) & "\\",\\"description\\":\\"" & my jsonEsc(eDesc) & "\\",\\"allDay\\":" & eAllDay & "}}"
end tell`;
}

function buildSearchEvents(bundleId: string, parameters: Record<string, unknown>): string {
  const query = parameters["query"] as string | undefined;
  if (!query) throw new Error("calendar.search_events requires 'query' parameter");
  const limit = (parameters["limit"] as number | undefined) ?? 20;

  return `tell application id "${bundleId}"
    set matchingEvents to {}
    repeat with c in calendars
        repeat with e in (events of c whose summary contains "${esc(query)}")
            set end of matchingEvents to e
        end repeat
    end repeat
    set resultCount to count of matchingEvents
    if resultCount > ${limit} then set resultCount to ${limit}
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
end tell`;
}

function buildCreateEvent(bundleId: string, parameters: Record<string, unknown>): string {
  const title = parameters["title"] as string | undefined;
  if (!title) throw new Error("calendar.create_event requires 'title' parameter");
  const startDate = parameters["startDate"] as string | undefined;
  if (!startDate) throw new Error("calendar.create_event requires 'startDate' parameter");
  const endDate = parameters["endDate"] as string | undefined;
  if (!endDate) throw new Error("calendar.create_event requires 'endDate' parameter");
  const calendarName = esc((parameters["calendarName"] as string | undefined) ?? "Calendar");
  const location = esc((parameters["location"] as string | undefined) ?? "");
  const notes = esc((parameters["notes"] as string | undefined) ?? "");
  const allDay = (parameters["allDay"] as boolean | undefined) ?? false;

  return `tell application id "${bundleId}"
    set targetCalendar to first calendar whose name is "${calendarName}"
    set startDate to date "${esc(startDate)}"
    set endDate to date "${esc(endDate)}"
    set newEvent to make new event at end of events of targetCalendar with properties {summary:"${esc(title)}", start date:startDate, end date:endDate, location:"${location}", description:"${notes}", allday event:${allDay}}
    set eId to uid of newEvent
    return "{\\"id\\":\\"" & my jsonEsc(eId) & "\\",\\"name\\":\\"${esc(title)}\\",\\"type\\":\\"event\\"}"
end tell`;
}

function buildUpdateEvent(bundleId: string, parameters: Record<string, unknown>): string {
  const eventId = parameters["eventId"] as string | undefined;
  if (!eventId) throw new Error("calendar.update_event requires 'eventId' parameter");
  const setStatements: string[] = [];
  if (parameters["title"] !== undefined) {
    setStatements.push(`set summary of e to "${esc(parameters["title"] as string)}"`);
  }
  if (parameters["location"] !== undefined) {
    setStatements.push(`set location of e to "${esc(parameters["location"] as string)}"`);
  }
  if (parameters["notes"] !== undefined) {
    setStatements.push(`set description of e to "${esc(parameters["notes"] as string)}"`);
  }
  if (parameters["startDate"] !== undefined) {
    setStatements.push(`set start date of e to date "${esc(parameters["startDate"] as string)}"`);
  }
  if (parameters["endDate"] !== undefined) {
    setStatements.push(`set end date of e to date "${esc(parameters["endDate"] as string)}"`);
  }
  if (setStatements.length === 0) {
    throw new Error("calendar.update_event requires at least one property to update");
  }
  return `tell application id "${bundleId}"
    set matchingEvents to (events of calendars whose uid is "${esc(eventId)}")
    set flatEvents to {}
    repeat with calEvents in matchingEvents
        repeat with ev in calEvents
            set end of flatEvents to ev
        end repeat
    end repeat
    if (count of flatEvents) is 0 then error "Event not found: ${esc(eventId)}"
    set e to item 1 of flatEvents
    ${setStatements.join("\n    ")}
    return "{\\"id\\":\\"" & my jsonEsc(uid of e) & "\\",\\"name\\":\\"" & my jsonEsc(summary of e) & "\\",\\"type\\":\\"event\\"}"
end tell`;
}

function buildDeleteEvent(bundleId: string, parameters: Record<string, unknown>): string {
  const eventId = parameters["eventId"] as string | undefined;
  if (!eventId) throw new Error("calendar.delete_event requires 'eventId' parameter");
  return `tell application id "${bundleId}"
    set matchingEvents to (events of calendars whose uid is "${esc(eventId)}")
    set flatEvents to {}
    repeat with calEvents in matchingEvents
        repeat with ev in calEvents
            set end of flatEvents to ev
        end repeat
    end repeat
    if (count of flatEvents) is 0 then error "Event not found: ${esc(eventId)}"
    set e to item 1 of flatEvents
    set eName to summary of e
    delete e
    return "{\\"deleted\\":true,\\"name\\":\\"" & my jsonEsc(eName) & "\\"}"
end tell`;
}

function buildShow(bundleId: string): string {
  return `tell application id "${bundleId}"
    activate
    return "{\\"shown\\":true}"
end tell`;
}
