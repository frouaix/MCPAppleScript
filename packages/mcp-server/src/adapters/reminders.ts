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

const remindersPropertiesSchema = z
  .object({
    name: z.string().min(1).optional(),
    body: z.string().optional(),
    dueDate: z
      .string()
      .date()
      .or(z.string().datetime({ offset: true, precision: 0 }))
      .optional(),
    priority: z.number().int().min(0).max(9).optional(),
    completed: z.boolean().optional(),
  })
  .strict();

function validateReminderProperties(
  properties: Record<string, unknown>,
  operation: "create" | "update"
) {
  const schema =
    operation === "create"
      ? remindersPropertiesSchema.extend({ name: z.string().min(1) })
      : remindersPropertiesSchema.refine(
          (value) => Object.values(value).some((field) => field !== undefined),
          "At least one reminder property is required."
        );
  const result = schema.safeParse(properties);
  if (!result.success) {
    throw new McpAppleScriptError(
      "INVALID_REQUEST",
      `Invalid Reminders ${operation}: ${result.error.message}`
    );
  }
  return result.data;
}

export class RemindersAdapter implements ResourceAdapter {
  readonly info: AppInfo = {
    name: "reminders",
    displayName: "Apple Reminders",
    bundleId: "com.apple.reminders",
    capabilities: {
      listContainers: true,
      list: true,
      get: true,
      search: true,
      create: true,
      update: true,
      delete: true,
      actions: ["show", "complete"],
    },
    itemType: "reminder",
    containerType: "list",
    propertiesSchema: remindersPropertiesSchema,
    requiredValidation: [],
  };

  listContainers() {
    return { templateId: "reminders.list_lists", parameters: {} };
  }

  list(params: ListParams) {
    return {
      templateId: "reminders.list_reminders",
      parameters: {
        listId: params.containerId ?? "",
        limit: params.limit ?? 50,
        offset: params.offset ?? 0,
      },
    };
  }

  get(id: string) {
    return { templateId: "reminders.get_reminder", parameters: { reminderId: id } };
  }

  search(params: SearchParams) {
    return {
      templateId: "reminders.search_reminders",
      parameters: {
        query: params.query,
        listId: params.containerId ?? "",
        limit: params.limit ?? 20,
        offset: params.offset ?? 0,
      },
    };
  }

  create(params: CreateParams) {
    const properties = validateReminderProperties(params.properties, "create");
    return {
      templateId: "reminders.create_reminder",
      parameters: {
        listId: params.containerId ?? "",
        ...properties,
      },
    };
  }

  update(params: UpdateParams) {
    const properties = validateReminderProperties(params.properties, "update");
    return {
      templateId: "reminders.update_reminder",
      parameters: {
        ...properties,
        reminderId: params.id,
      },
    };
  }

  delete(id: string) {
    return { templateId: "reminders.delete_reminder", parameters: { reminderId: id } };
  }

  action(params: ActionParams) {
    if (params.action === "show") {
      return { templateId: "reminders.show", parameters: params.parameters };
    }
    if (params.action === "complete") {
      if (typeof params.parameters.reminderId !== "string" || !params.parameters.reminderId) {
        throw new McpAppleScriptError("INVALID_REQUEST", "reminderId is required.");
      }
      return {
        templateId: "reminders.complete",
        parameters: { reminderId: params.parameters.reminderId },
      };
    }
    throw new UnsupportedOperationError("reminders", params.action);
  }
}
