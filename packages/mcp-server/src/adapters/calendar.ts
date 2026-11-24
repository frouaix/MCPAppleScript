import {
  ResourceAdapter,
  AppInfo,
  ListParams,
  SearchParams,
  CreateParams,
  UpdateParams,
  ActionParams,
  UnsupportedOperationError,
} from "./types.js";
import { z } from "zod";
import { McpAppleScriptError } from "../util/errors.js";

const eventTimestamp = z.string().datetime({ offset: true, precision: 0 });

const calendarPropertiesSchema = z
  .object({
    title: z.string().min(1).optional(),
    startDate: eventTimestamp.optional(),
    endDate: eventTimestamp.optional(),
    location: z.string().optional(),
    notes: z.string().optional(),
    allDay: z.boolean().optional(),
  })
  .strict();

function validateEventProperties(
  properties: Record<string, unknown>,
  operation: "create" | "update"
): z.infer<typeof calendarPropertiesSchema> {
  const schema =
    operation === "create"
      ? calendarPropertiesSchema.extend({
          title: z.string().min(1),
          startDate: eventTimestamp,
          endDate: eventTimestamp,
        })
      : calendarPropertiesSchema.refine(
          (value) => Object.values(value).some((field) => field !== undefined),
          "At least one event property is required."
        );
  const result = schema.safeParse(properties);
  if (!result.success) {
    throw new McpAppleScriptError(
      "INVALID_REQUEST",
      `Invalid Calendar ${operation}: ${result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join(", ")}`
    );
  }
  const { startDate, endDate } = result.data;
  if (
    startDate !== undefined &&
    endDate !== undefined &&
    Date.parse(endDate) <= Date.parse(startDate)
  ) {
    throw new McpAppleScriptError("INVALID_REQUEST", "endDate must follow startDate.");
  }
  return result.data;
}

export class CalendarAdapter implements ResourceAdapter {
  readonly info: AppInfo = {
    name: "calendar",
    displayName: "Apple Calendar",
    bundleId: "com.apple.iCal",
    capabilities: {
      listContainers: true,
      list: true,
      get: true,
      search: true,
      create: true,
      update: true,
      delete: true,
      actions: ["show"],
    },
    itemType: "event",
    containerType: "calendar",
    propertiesSchema: calendarPropertiesSchema,
    requiredValidation: [],
  };

  listContainers() {
    return { templateId: "calendar.list_calendars", parameters: {} };
  }

  list(params: ListParams) {
    return {
      templateId: "calendar.list_events",
      parameters: {
        calendarId: params.containerId ?? "",
        limit: params.limit ?? 50,
        offset: params.offset ?? 0,
        startDate: params.startDate,
        endDate: params.endDate,
        timeZone: params.timeZone,
      },
    };
  }

  get(id: string) {
    return { templateId: "calendar.get_event", parameters: { eventId: id } };
  }

  search(params: SearchParams) {
    return {
      templateId: "calendar.search_events",
      parameters: {
        query: params.query,
        calendarId: params.containerId ?? "",
        limit: params.limit ?? 20,
        offset: params.offset ?? 0,
        startDate: params.startDate,
        endDate: params.endDate,
        timeZone: params.timeZone,
      },
    };
  }

  create(params: CreateParams) {
    const properties = validateEventProperties(params.properties, "create");
    return {
      templateId: "calendar.create_event",
      parameters: {
        calendarName: params.containerId ?? "",
        title: properties.title,
        startDate: properties.startDate,
        endDate: properties.endDate,
        location: properties.location ?? "",
        notes: properties.notes ?? "",
        allDay: properties.allDay ?? false,
      },
    };
  }

  update(params: UpdateParams) {
    const properties = validateEventProperties(params.properties, "update");
    return {
      templateId: "calendar.update_event",
      parameters: {
        ...properties,
        eventId: params.id,
      },
    };
  }

  delete(id: string) {
    return { templateId: "calendar.delete_event", parameters: { eventId: id } };
  }

  action(params: ActionParams) {
    if (params.action === "show") {
      return { templateId: "calendar.show", parameters: params.parameters };
    }
    throw new UnsupportedOperationError("calendar", params.action);
  }
}
