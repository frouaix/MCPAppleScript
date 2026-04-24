import {
  ResourceAdapter, AppInfo, ListParams, SearchParams,
  CreateParams, UpdateParams, ActionParams, UnsupportedOperationError,
} from "./types.js";
import { z } from "zod";

const calendarPropertiesSchema = z.object({
  title: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  location: z.string().optional(),
  notes: z.string().optional(),
  allDay: z.boolean().optional(),
}).passthrough();

export class CalendarAdapter implements ResourceAdapter {
  readonly info: AppInfo = {
    name: "calendar",
    displayName: "Apple Calendar",
    bundleId: "com.apple.iCal",
    capabilities: {
      listContainers: true, list: true, get: true, search: true,
      create: true, update: true, delete: true, actions: ["show"],
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
      },
    };
  }

  create(params: CreateParams) {
    return {
      templateId: "calendar.create_event",
      parameters: {
        calendarName: (params.containerId as string) ?? "Calendar",
        title: params.properties.title ?? "",
        startDate: params.properties.startDate ?? "",
        endDate: params.properties.endDate ?? "",
        location: params.properties.location ?? "",
        notes: params.properties.notes ?? "",
        allDay: params.properties.allDay ?? false,
      },
    };
  }

  update(params: UpdateParams) {
    return {
      templateId: "calendar.update_event",
      parameters: {
        eventId: params.id,
        ...params.properties,
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
