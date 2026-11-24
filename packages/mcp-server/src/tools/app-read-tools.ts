import { z } from "zod";
import { CrudToolDeps, runValidation } from "./crud-tools.js";
import { resolveEventRange, timestamp } from "./calendar-range.js";
export { resolveEventRange } from "./calendar-range.js";

const dryRun = z
  .boolean()
  .optional()
  .describe("Return the execution plan without accessing app data");
const limit = z.number().int().min(1).max(200).optional().describe("Page size, default 50");
const offset = z.number().int().min(0).optional().describe("Pagination offset, default 0");
const id = z.string().min(1).max(500);
export function registerAppReadTools(deps: CrudToolDeps): void {
  const { server, registerTool, policy, appRegistry, executeTemplate, validationContext } = deps;
  function execute(
    app: "calendar" | "notes" | "reminders" | "contacts",
    operation: string,
    params: Record<string, unknown>,
    mapped: () => { templateId: string; parameters: Record<string, unknown> }
  ) {
    policy.assertAllowed({ toolName: operation, app });
    const adapter = appRegistry.getOrThrow(app);
    const error = runValidation(adapter, params, validationContext);
    if (error) return Promise.resolve(error);
    const { templateId, parameters } = mapped();
    return executeTemplate(templateId, adapter.info.bundleId, parameters, params.dryRun === true);
  }

  if (policy.getPermissions().contacts !== "off") {
    const adapter = appRegistry.getOrThrow("contacts");
    registerTool(
      "contacts.search",
      server.tool(
        "contacts.search",
        "Find contacts by name, organization, email, or phone. Returns IDs and names, with pagination. Use contacts.get to read details.",
        {
          query: z.string().min(1).max(500),
          groupId: id
            .optional()
            .describe("Group ID from app.list_containers; omit for all contacts"),
          limit: limit.describe("Page size, default 20"),
          offset,
          dryRun,
        },
        { readOnlyHint: true },
        (params) =>
          execute("contacts", "app.search", params, () =>
            adapter.search({
              query: params.query,
              containerId: params.groupId,
              limit: params.limit,
              offset: params.offset,
            })
          )
      )
    );
    registerTool(
      "contacts.get",
      server.tool(
        "contacts.get",
        "Read a contact's name, organization, job title, labeled email addresses, and phone numbers by ID from contacts.search.",
        { contactId: id, dryRun },
        { readOnlyHint: true },
        (params) => execute("contacts", "app.get", params, () => adapter.get(params.contactId))
      )
    );
  }

  if (policy.getPermissions().reminders !== "off") {
    registerTool(
      "reminders.list_due",
      server.tool(
        "reminders.list_due",
        "List incomplete reminders due today or tomorrow in the Mac's local time zone, including date-only reminders. Excludes overdue and completed reminders. Results are ordered by due date and paginated.",
        {
          day: z.enum(["today", "tomorrow"]).optional().describe("Local day; defaults to today"),
          listId: id.optional().describe("List ID from app.list_containers; omit for all lists"),
          limit,
          offset,
          dryRun,
        },
        { readOnlyHint: true },
        (params) =>
          execute("reminders", "app.list", params, () => ({
            templateId: "reminders.list_due",
            parameters: {
              listId: params.listId ?? "",
              limit: params.limit ?? 50,
              offset: params.offset ?? 0,
              ...resolveEventRange({ day: params.day ?? "today" }),
            },
          }))
      )
    );
  }

  if (policy.getPermissions().calendar !== "off") {
    const adapter = appRegistry.getOrThrow("calendar");
    registerTool(
      "calendar.list_calendars",
      server.tool(
        "calendar.list_calendars",
        "List local calendars using EventKit. Returns calendar IDs and names. Use calendar.list_events to read your schedule, appointments, and meetings.",
        { dryRun },
        { readOnlyHint: true },
        (params) =>
          execute("calendar", "app.list_containers", params, () => adapter.listContainers())
      )
    );
    registerTool(
      "calendar.list_events",
      server.tool(
        "calendar.list_events",
        'Read appointments, meetings, and schedule using EventKit, including recurring occurrences. For "what is my schedule tomorrow?" use day:"tomorrow"; for today use day:"today". Otherwise provide startDate and endDate with UTC offsets, up to three years. Filters overlapping events across all calendars unless calendarId is given. Returns total, offset, hasMore, timeZone, limitations and items with id, name, calendarId, calendarName, startDate/endDate (ISO timestamps in the Mac local time zone with UTC offset), location, allDay, and isRecurring. Fetch all pages before summarizing and disclose any limitations.',
        {
          day: z
            .enum(["today", "tomorrow"])
            .optional()
            .describe(
              "Resolve a whole day using the Mac's current local date/time zone; omit startDate/endDate"
            ),
          startDate: timestamp.optional(),
          endDate: timestamp
            .optional()
            .describe("Exclusive end of the range; must follow startDate"),
          calendarId: id
            .optional()
            .describe("Calendar ID from calendar.list_calendars; omit for all."),
          limit,
          offset,
          dryRun,
        },
        { readOnlyHint: true },
        (params) =>
          execute("calendar", "app.list", params, () =>
            adapter.list({
              containerId: params.calendarId,
              limit: params.limit,
              offset: params.offset,
              ...resolveEventRange(params),
            })
          )
      )
    );
  }

  if (policy.getPermissions().notes !== "off") {
    const adapter = appRegistry.getOrThrow("notes");
    registerTool(
      "notes.list_folders",
      server.tool(
        "notes.list_folders",
        "List folders in local Apple Notes with id, name, and itemCount. Use notes.list_notes or notes.search_notes to find notes, then notes.get_note to read their content.",
        { dryRun },
        { readOnlyHint: true },
        (params) => execute("notes", "app.list_containers", params, () => adapter.listContainers())
      )
    );
    registerTool(
      "notes.list_notes",
      server.tool(
        "notes.list_notes",
        "List local Apple Notes titles and IDs, optionally in a folder. Returns total and items with id, name, modifiedAt. Use offset/limit to retrieve all pages and notes.get_note for full text.",
        { folderId: id.optional(), limit, offset, dryRun },
        { readOnlyHint: true },
        (params) =>
          execute("notes", "app.list", params, () =>
            adapter.list({
              containerId: params.folderId,
              limit: params.limit,
              offset: params.offset,
            })
          )
      )
    );
    registerTool(
      "notes.search_notes",
      server.tool(
        "notes.search_notes",
        "Find local Apple Notes by text in their title or body, optionally within a folder. Returns matching note IDs, titles, and modification dates; use notes.get_note to read full text. Results are limited, not a complete paginated listing.",
        {
          query: z.string().min(1).max(500).describe("Text to find in note titles or body"),
          folderId: id.optional(),
          limit: limit.describe("Maximum matching notes, default 20"),
          dryRun,
        },
        { readOnlyHint: true },
        (params) =>
          execute("notes", "app.search", params, () =>
            adapter.search({
              query: params.query,
              containerId: params.folderId,
              limit: params.limit,
            })
          )
      )
    );
    registerTool(
      "notes.get_note",
      server.tool(
        "notes.get_note",
        "Read the full plain-text content of a local Apple Notes note by ID from list/search. Returns id, name, containerName, createdAt, modifiedAt, and properties.body.",
        {
          noteId: id.describe("Note ID returned by notes.list_notes or notes.search_notes"),
          dryRun,
        },
        { readOnlyHint: true },
        (params) => execute("notes", "app.get", params, () => adapter.get(params.noteId))
      )
    );
  }
}
