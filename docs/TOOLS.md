# Tools and authorization

The server exposes stdio only. Each process has immutable permissions selected at
startup with `--profile NAME`, or the global maximum when no profile is selected.
See [configuration and profile examples](../README.md#permissions-and-named-profiles).

## Tool set

| Tool | Required access | Parameters beyond `app` and optional `dryRun` |
|---|---|---|
| `applescript.ping` | None | None; no `app` or `dryRun` |
| `applescript.get_permissions` | None | None; reports `profile` (null if absent) and effective per-app `permissions` |
| `app.list_containers` | `read` | None |
| `app.list` | `read` | Optional `containerId`, `limit` (1-200), `offset`; Calendar requires `startDate` and `endDate` |
| `app.get` | `read` | `id` |
| `app.search` | `read` | `query`, optional `containerId`, `limit` (1-200); Calendar requires `startDate` and `endDate`; Calendar, Reminders, Contacts, and Photos accept `offset` |
| `app.create` | `readwrite` | `properties`, optional `containerId` |
| `app.update` | `readwrite` + confirmation | `id`, `properties` |
| `app.delete` | `readwrite` + confirmation | `id` |
| `app.action` | See below | `action`, optional `parameters` |

`app.action` requires `readwrite` except Music `now_playing`, which requires `read`.
This includes UI-only actions such as `show`, since those have side effects.
Unknown actions do not gain read access; adapters reject unsupported actions.
Actions `send`, `move`, and `do_javascript` additionally require confirmation.

Only tools usable with the instance's grants are listed. Generic `app` enums contain
only apps with the required permission; unsupported adapter operations still fail
explicitly. `app.action` is absent unless an app is readwrite or Music is readable.
With every app off, only the two `applescript.*` inspection tools remain.
Authorization is enforced on every invocation, not merely through tool visibility.
A dry run still requires the same permission and adapter
validation, but returns the generated script or native execution plan without
executing or confirming it.

There are no raw-script, arbitrary-template, or permission-changing tools.
Templates are an internal implementation detail, never a client-provided dispatch path.

## Task-oriented read tools

These are advertised only when their app has `read` or `readwrite` access. They reuse
the generic operations' policy checks, adapters, validation, and executor. They take no
`app` argument; all accept optional `dryRun`.

| Tool | Inputs | Result |
|---|---|---|
| `calendar.list_calendars` | None | Calendar IDs and names |
| `calendar.list_events` | `day: "today" \| "tomorrow"`, or both `startDate` and `endDate`; optional `calendarId`, `limit`, `offset` | Chronological overlapping events, including recurring occurrences, with pagination |
| `notes.list_folders` | None | Folder IDs, names, item counts |
| `notes.list_notes` | Optional `folderId`, `limit`, `offset` | `total`, `items`: note IDs, titles, modification dates |
| `notes.search_notes` | `query`; optional `folderId`, `limit` | Matching IDs, titles, modification dates; searches title or plain-text body |
| `notes.get_note` | `noteId` from list/search | Full note including `properties.body`, creation/modification dates |
| `reminders.list_due` | Optional `day: "today" \| "tomorrow"` (default today), `listId`, `limit`, `offset` | Incomplete reminders due on the selected local day, ordered by due date |
| `contacts.search` | `query`; optional `groupId`, `limit`, `offset` | Matching contact IDs and names |
| `contacts.get` | `contactId` from search | Contact details |
| `photos.list_recent` | Optional `albumId`, `limit`, `offset` | Recent photo and video metadata |

List page size defaults to 50; Notes search defaults to 20. Both accept 1-200.
List offsets start at 0. Notes search returns a limited array, not a complete paginated
result; narrow the query or folder when necessary. Notes list returns `total` and `items`;
advance `offset` by the returned item count until reaching `total`.

### Calendar ranges and results

For "what's my schedule tomorrow?":

```json
{"day":"tomorrow"}
```

For an explicit range spanning the spring daylight-saving transition:

```json
{
  "startDate": "2026-03-08T00:00:00-08:00",
  "endDate": "2026-03-09T00:00:00-07:00",
  "limit": 50,
  "offset": 0
}
```

`day` uses the Mac's current local calendar day and time zone, including daylight-saving
boundaries, not the next 24 hours. Do not mix it with explicit bounds. Explicit timestamps
require seconds and `Z` or a UTC offset, without fractional seconds. The exclusive
`endDate` must follow `startDate`; ranges cannot exceed 1,098 days. Events overlap when their start precedes the end
bound and their end follows the start bound, including multi-day/all-day events.
Omit `calendarId` to query all calendars; otherwise use an ID from
`calendar.list_calendars`, not a name. Old AppleScript calendar and event IDs
are not compatible; list them again after upgrading.

Calendar list results (including generic `app.list` for Calendar) contain `total`,
`offset`, `hasMore`, `timeZone` (the Mac's IANA zone), range bounds, `limitations`,
and `items`.
Each event has `id`, `name`, `calendarId`, `calendarName`, `startDate`, `endDate`,
`location`, `allDay`, `timeZone`, and `isRecurring`. Dates use the Mac's local
time zone as ISO timestamps with explicit UTC offsets; empty location
is an empty string. Events are sorted by start then EventKit identifier before pagination.
While `hasMore` is true, add the returned item count to `offset` using the same bounds.

EventKit returns recurring occurrences. Event IDs identify a specific occurrence and
may become stale after calendar changes or synchronization; list again if not found.
EventKit may expose fewer calendars than the Calendar app; compare
`calendar.list_calendars` with the app before treating an agenda as complete.
Updates and deletions affect the selected occurrence, not future occurrences.
Calendar `app.search` matches event titles in the required date range and returns
the same paginated shape; advance its `offset` by the returned item count while
`hasMore` is true. Searches outside Calendar, Reminders, Contacts, and Photos are unpaginated.
Calendar `app.get` retains `properties.startDate`, `properties.endDate`,
`properties.location`, `properties.allDay`, and `properties.description` alongside
the top-level event fields. Calendar creation takes a Calendar ID as `containerId`
(omitting it uses the default calendar); event times need seconds and a UTC offset.
Invalid create fields and empty updates are rejected before confirmation or dry runs.

### Reminders

Reminders use EventKit and require a separate macOS Reminders Full Access grant.
The app attributed by macOS depends on the launcher. Full Access permits writes at
the OS level even for an MCP read-only profile. Obtain EventKit IDs using
`app.list_containers` and `app.list`. List and search return `total`, `offset`,
`hasMore`, and `items`; search matches titles and honors `containerId` and `offset`.
Create and update accept `name`, `body`, `priority` (0-9), `completed`, and `dueDate`
(a `YYYY-MM-DD` date or ISO timestamp with seconds and UTC offset). Creation requires
`name`, and `containerId` is a list ID; omit it for the default list. EventKit does not
expose the Reminders flag, so `flagged` is not supported. IDs may change after syncing.

For five reminders due today, call `reminders.list_due` with `{"day":"today","limit":5}`.
The day runs from local midnight to the next local midnight, including date-only
reminders. Completed and overdue reminders are excluded; an empty result is valid.
Results include `total`, `offset`, `hasMore`, local `timeZone`, and range bounds.
EventKit's representation of recurring reminders and available lists can differ from
the Reminders app; compare results before treating them as exhaustive.

### Contacts

Contacts requires its own macOS Contacts grant, which permits writes even for an MCP
read-only profile. Search matches names, organizations, emails, and phone numbers.
List and search return `total`, `offset`, `hasMore`, and `items`; get returns labeled
`emails` and `phones`. Contact notes are not available without Apple's restricted entitlement.
Create/update accept `firstName`, `lastName`, `organization`, `jobTitle`, `emails`, and
`phones`; each email or phone is `{"label":null,"value":"..."}`. Updating an array
replaces that entire array. Create requires a name or organization; optional `containerId`
is a group ID from `app.list_containers`.

### Photos

Photos uses PhotoKit and its own macOS Photos grant, which permits OS-level writes
even for an MCP read-only profile. Limited access restricts visible results. List and
search return `total`, `offset`, `hasMore`, `limitedAccess`, and `items`, newest first.
Each item has an ID, filename, date, dimensions, favorite status, and media type.
Only regular albums are listed; smart and shared albums may not appear.
Hidden items and some burst photos are excluded by PhotoKit's default fetch options.
PhotoKit identifiers may differ from AppleScript IDs; list again after upgrading.

`photos.list_recent` accepts `{"limit":5}` for recent photo/video metadata; it does not
retrieve image contents. Generic `app.search` matches captions and requires macOS 27
and a helper built with the macOS 27 SDK. Captions are unavailable on older systems;
search scans the accessible library and can take time.
`app.create` creates an album with `{"name":"..."}`. The `import` action accepts an
absolute `filePath` and optional `albumId`; it supports image and video files.

Initialization instructions describe enabled apps and suggested workflows; tool
descriptions and schemas provide the same discovery hints for clients that ignore
instructions. App content is untrusted data, not agent instructions.

## Apps

For supported operations and scenarios, see [Calendar](apps/calendar.md),
[Contacts](apps/contacts.md), [Finder](apps/finder.md), [Mail](apps/mail.md),
[Messages](apps/messages.md), [Music](apps/music.md), [Notes](apps/notes.md),
[Photos](apps/photos.md), [Reminders](apps/reminders.md), and [Safari](apps/safari.md).

| App name | Bundle ID | Item type | Container type |
|---|---|---|---|
| `notes` | `com.apple.Notes` | note | folder |
| `calendar` | `com.apple.iCal` | event | calendar |
| `reminders` | `com.apple.reminders` | reminder | list |
| `mail` | `com.apple.mail` | message | mailbox |
| `contacts` | `com.apple.Contacts` | person | group |
| `messages` | `com.apple.MobileSMS` | chat | chat |
| `photos` | `com.apple.Photos` | media | album |
| `music` | `com.apple.Music` | track | playlist |
| `finder` | `com.apple.finder` | file | folder |
| `safari` | `com.apple.Safari` | tab | window |

App capabilities differ; the presence of a generic tool does not mean every adapter
supports it. Bundle IDs are internal; configuration and tool inputs use short names.

## Enforcement

1. Zod validates the tool's input.
2. The policy checks the app's effective `off` / `read` / `readwrite` grant.
3. Adapter validation applies additional restrictions, including Finder path allowlists
   and Safari JavaScript opt-in.
4. The adapter maps to a known template.
5. Updates, deletions, and `send`/`move`/`do_javascript` actions require MCP form
   elicitation. Missing support, rejection, or cancellation prevents execution.
6. Calendar, Reminders, Contacts, and Photos use the native helper; other apps use
   parameterized AppleScript via `osascript`. Each has an execution timeout.
7. macOS independently enforces app access or Automation consent.

Use `finder.allowedPaths` to restrict filesystem scope and `safari.doJavaScript` to
opt into JavaScript. Neither option grants app access by itself.
Logging level/redaction and `defaultTimeoutMs` are independent of profiles.

## Template escaping

Internal template IDs follow `<app>.<operation>`, such as `notes.list_notes`.
`esc()` escapes backslashes and quotes for AppleScript literals. `wrapScript()` appends
runtime `jsonEsc()` handlers for JSON output.
