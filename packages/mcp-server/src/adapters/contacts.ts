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

const labeledValue = z
  .object({
    label: z.string().max(200).nullable(),
    value: z.string().min(1).max(500),
  })
  .strict();
const contactsPropertiesSchema = z
  .object({
    firstName: z.string().max(500).optional(),
    lastName: z.string().max(500).optional(),
    organization: z.string().max(500).optional(),
    jobTitle: z.string().max(500).optional(),
    emails: z.array(labeledValue).max(50).optional(),
    phones: z.array(labeledValue).max(50).optional(),
  })
  .strict();

function validateContact(properties: Record<string, unknown>, operation: "create" | "update") {
  const parsed = contactsPropertiesSchema.safeParse(properties);
  if (!parsed.success) {
    throw new McpAppleScriptError(
      "INVALID_REQUEST",
      `Invalid Contacts ${operation}: ${parsed.error.message}`
    );
  }
  if (
    operation === "create" &&
    ![parsed.data.firstName, parsed.data.lastName, parsed.data.organization].some((value) =>
      value?.trim()
    )
  ) {
    throw new McpAppleScriptError(
      "INVALID_REQUEST",
      "A first name, last name, or organization is required."
    );
  }
  if (operation === "update" && !Object.values(parsed.data).some((value) => value !== undefined)) {
    throw new McpAppleScriptError("INVALID_REQUEST", "At least one contact property is required.");
  }
  return parsed.data;
}

function requireContactId(id: string): string {
  if (!id) throw new McpAppleScriptError("INVALID_REQUEST", "Contact ID is required.");
  return id;
}

export class ContactsAdapter implements ResourceAdapter {
  readonly info: AppInfo = {
    name: "contacts",
    displayName: "Apple Contacts",
    bundleId: "com.apple.Contacts",
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
    itemType: "person",
    containerType: "group",
    propertiesSchema: contactsPropertiesSchema,
    requiredValidation: [],
  };

  listContainers() {
    return { templateId: "contacts.list_groups", parameters: {} };
  }

  list(params: ListParams) {
    return {
      templateId: "contacts.list_people",
      parameters: {
        groupId: params.containerId ?? "",
        limit: params.limit ?? 50,
        offset: params.offset ?? 0,
      },
    };
  }

  get(id: string) {
    return { templateId: "contacts.get_person", parameters: { personId: requireContactId(id) } };
  }

  search(params: SearchParams) {
    if (!params.query)
      throw new McpAppleScriptError("INVALID_REQUEST", "Search query is required.");
    return {
      templateId: "contacts.search_people",
      parameters: {
        query: params.query,
        groupId: params.containerId ?? "",
        limit: params.limit ?? 20,
        offset: params.offset ?? 0,
      },
    };
  }

  create(params: CreateParams) {
    const properties = validateContact(params.properties, "create");
    return {
      templateId: "contacts.create_person",
      parameters: {
        ...properties,
        groupId: params.containerId ?? "",
      },
    };
  }

  update(params: UpdateParams) {
    const properties = validateContact(params.properties, "update");
    return {
      templateId: "contacts.update_person",
      parameters: {
        ...properties,
        personId: requireContactId(params.id),
      },
    };
  }

  delete(id: string) {
    return { templateId: "contacts.delete_person", parameters: { personId: requireContactId(id) } };
  }

  action(params: ActionParams) {
    if (params.action === "show") {
      return { templateId: "contacts.show", parameters: {} };
    }
    throw new UnsupportedOperationError("contacts", params.action);
  }
}
