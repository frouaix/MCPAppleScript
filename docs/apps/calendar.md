# Calendar

Uses EventKit. Calendar Full Access permits OS-level writes even with an MCP read-only grant.

- `calendar.list_calendars`: list calendars and IDs.
- `calendar.list_events`: list events for `day: "today" | "tomorrow"` or a `startDate`/`endDate` range; optionally filter by `calendarId` and paginate.
- `app.list_containers`, `app.list`, `app.get`, `app.search`: list calendars, list events, get an occurrence, or search event titles. List and search require a date range.
- `app.create`, `app.update`, `app.delete`: create, update, or delete an event. Creation requires `title`, `startDate`, and `endDate`; updates and deletes affect one occurrence.
- `app.action` with `show`: open Calendar.

Use `app: "calendar"` for generic calls. Timestamps require seconds and a UTC offset; returned times use the Mac's local time zone. EventKit may expose fewer calendars than Calendar displays. See [ranges and permissions](../TOOLS.md#calendar-ranges-and-results).

**Scenarios:** check tomorrow's schedule with `calendar.list_events`; find a meeting by title with `app.search` and a date range.
