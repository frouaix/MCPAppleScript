import {
  ResourceAdapter, AppInfo, ListParams, SearchParams,
  CreateParams, UpdateParams, ActionParams, UnsupportedOperationError,
} from "./types.js";

export class NotesAdapter implements ResourceAdapter {
  readonly info: AppInfo = {
    name: "notes",
    displayName: "Apple Notes",
    bundleId: "com.apple.Notes",
    capabilities: {
      listContainers: true, list: true, get: true, search: true,
      create: true, update: true, delete: true, actions: ["show"],
    },
    itemType: "note",
    containerType: "folder",
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
    return {
      templateId: "notes.create_note",
      parameters: {
        title: params.properties.title ?? "Untitled",
        body: params.properties.body ?? "",
        folderId: params.containerId ?? "",
      },
    };
  }

  update(params: UpdateParams) {
    return {
      templateId: "notes.update_note",
      parameters: {
        noteId: params.id,
        ...params.properties,
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
