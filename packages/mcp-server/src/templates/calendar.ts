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
end tell`;
}

function buildListEvents(bundleId: string, parameters: Record<string, unknown>): string {
  const calendarId = (parameters["calendarId"] as string | undefined) ?? "";
  const limit = (parameters["limit"] as number | undefined) ?? 50;

  const targetClause = calendarId
    ? `events of (first calendar whose uid is "${esc(calendarId)}")`
    : "events of calendars";

  return `tell application id "${bundleId}"
    set allEvents to ${targetClause}
    set totalCount to count of allEvents
    set resultCount to totalCount
    if resultCount > ${limit} then set resultCount to ${limit}
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
end tell`;
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
