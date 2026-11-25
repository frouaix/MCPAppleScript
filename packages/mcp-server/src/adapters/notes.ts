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

const notesPropertiesSchema = z
  .object({
    title: z.string().max(500).optional(),
    name: z.string().max(500).optional(),
    body: z.string().max(100000).optional(),
  })
  .strict();

function validateNotesProperties(
  properties: Record<string, unknown>,
  operation: "create" | "update"
) {
  const schema =
    operation === "create"
      ? notesPropertiesSchema.omit({ name: true })
      : notesPropertiesSchema
          .omit({ title: true })
          .refine(
            (value) => value.name !== undefined || value.body !== undefined,
            "At least one note property is required."
          );
  const parsed = schema.safeParse(properties);
  if (!parsed.success) {
    throw new McpAppleScriptError(
      "INVALID_REQUEST",
      `Invalid Notes ${operation}: ${parsed.error.message}`
    );
  }
  return parsed.data;
}

export class NotesAdapter implements ResourceAdapter {
  readonly info: AppInfo = {
    name: "notes",
    displayName: "Apple Notes",
    bundleId: "com.apple.Notes",
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
    itemType: "note",
    containerType: "folder",
    propertiesSchema: notesPropertiesSchema,
    requiredValidation: [],
  };

  listContainers() {
    return { templateId: "notes.list_folders", parameters: {} };
  }

  list(params: ListParams) {
    return {
      templateId: "notes.list_notes",
      parameters: {
        folderId: params.containerId ?? "",
        limit: params.limit ?? 50,
        offset: params.offset ?? 0,
      },
    };
  }

  get(id: string) {
    return { templateId: "notes.get_note", parameters: { noteId: id } };
  }

  search(params: SearchParams) {
    return {
      templateId: "notes.search_notes",
      parameters: {
        query: params.query,
        folderId: params.containerId ?? "",
        limit: params.limit ?? 20,
      },
    };
  }

  create(params: CreateParams) {
    const properties = validateNotesProperties(params.properties, "create");
    return {
      templateId: "notes.create_note",
      parameters: {
        title: "title" in properties ? (properties.title ?? "Untitled") : "Untitled",
        body: properties.body ?? "",
        folderId: params.containerId ?? "",
      },
    };
  }

  update(params: UpdateParams) {
    if (!params.id) throw new McpAppleScriptError("INVALID_REQUEST", "Note ID is required.");
    const properties = validateNotesProperties(params.properties, "update");
    return {
      templateId: "notes.update_note",
      parameters: {
        ...properties,
        noteId: params.id,
      },
    };
  }

  delete(id: string) {
    return { templateId: "notes.delete_note", parameters: { noteId: id } };
  }

  action(params: ActionParams) {
    if (params.action === "show") {
      return { templateId: "notes.show", parameters: params.parameters };
    }
    throw new UnsupportedOperationError("notes", params.action);
  }
}
