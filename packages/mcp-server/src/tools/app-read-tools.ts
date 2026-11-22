import { z } from "zod";
import { CrudToolDeps, runValidation } from "./crud-tools.js";
import { McpAppleScriptError } from "../util/errors.js";

const dryRun = z.boolean().optional().describe("Return the script without accessing app data");
const limit = z.number().int().min(1).max(200).optional().describe("Page size, default 50");
const offset = z.number().int().min(0).optional().describe("Pagination offset, default 0");
const id = z.string().min(1).max(500);
const timestamp = z
  .string()
  .datetime({ offset: true, precision: 0 })
  .describe("ISO 8601 timestamp with Z or an explicit UTC offset, e.g. 2026-11-02T00:00:00-08:00");

export function resolveEventRange(
  input: { day?: "today" | "tomorrow"; startDate?: string; endDate?: string },
  now = new Date()
): { startDate: string; endDate: string; timeZone: string } {
  let start: Date;
  let end: Date;
  if (input.day && input.startDate === undefined && input.endDate === undefined) {
    start = new Date(now);
    start.setHours(0, 0, 0, 0);
    if (input.day === "tomorrow") start.setDate(start.getDate() + 1);
    end = new Date(start);
    end.setDate(end.getDate() + 1);
  } else if (!input.day && input.startDate && input.endDate) {
    start = new Date(input.startDate);
    end = new Date(input.endDate);
  } else {
    throw new McpAppleScriptError(
      "INVALID_REQUEST",
      'Provide day ("today" or "tomorrow"), or both startDate and endDate, not both.'
    );
  }
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) {
    throw new McpAppleScriptError("INVALID_REQUEST", "endDate must be later than startDate.");
  }
  return {
    startDate: start.toISOString().replace(".000Z", "Z"),
    endDate: end.toISOString().replace(".000Z", "Z"),
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}

export function registerAppReadTools(deps: CrudToolDeps): void {
  const { server, registerTool, policy, appRegistry, executeTemplate, validationContext } = deps;
  function execute(
    app: "calendar" | "notes",
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

  if (policy.getPermissions().calendar !== "off") {
    const adapter = appRegistry.getOrThrow("calendar");
    registerTool(
      "calendar.list_calendars",
      server.tool(
        "calendar.list_calendars",
        "List local Apple Calendar calendars. Each id is the calendar's name, not a stable identifier; duplicate names cannot be used for selection. Use calendar.list_events to read your schedule, appointments, and meetings.",
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
        'Read appointments, meetings, and schedule from local Apple Calendar. For "what is my schedule tomorrow?" use day:"tomorrow"; for today use day:"today". Otherwise provide startDate and endDate with UTC offsets. Filters overlapping events across all calendars unless calendarId is given. Returns total, offset, hasMore, timeZone, limitations, and items with id, name, calendarId, calendarName, startDate/endDate (UTC ISO timestamps), location, allDay, and recurrence. Fetch all pages before summarizing; recurrence expansion is not supported.',
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
            .describe(
              "Calendar name from calendar.list_calendars; omit for all. Duplicate names are ambiguous and cannot be selected."
            ),
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
