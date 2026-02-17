import {
  ResourceAdapter, AppInfo, ListParams, SearchParams,
  CreateParams, UpdateParams, ActionParams, UnsupportedOperationError,
} from "./types.js";

/**
 * Finder adapter. Uses POSIX paths as IDs.
 * Containers are folders, items are files/folders within them.
 */
export class FinderAdapter implements ResourceAdapter {
  readonly info: AppInfo = {
    name: "finder",
    displayName: "Finder",
    bundleId: "com.apple.finder",
    capabilities: {
      listContainers: true, list: true, get: true, search: true,
      create: true, update: true, delete: true,
      actions: ["show", "reveal", "move", "duplicate"],
    },
    itemType: "file",
    containerType: "folder",
  };

  listContainers() {
    return { templateId: "finder.list_folders", parameters: { path: "~" } };
  }

  list(params: ListParams) {
    return {
      templateId: "finder.list_items",
      parameters: {
        path: params.containerId ?? "~",
        limit: params.limit ?? 50,
        offset: params.offset ?? 0,
      },
    };
  }

  get(id: string) {
    return { templateId: "finder.get_item", parameters: { path: id } };
  }

  search(params: SearchParams) {
    return {
      templateId: "finder.search_items",
      parameters: {
        query: params.query,
        path: params.containerId ?? "~",
        limit: params.limit ?? 20,
      },
    };
  }

  create(params: CreateParams) {
    return {
      templateId: "finder.create_folder",
      parameters: {
        name: params.properties.name ?? "",
        parentPath: params.containerId ?? "~",
      },
    };
  }

  update(params: UpdateParams) {
    // Finder "update" = move or duplicate via action, but we support rename via the general pattern
    return {
      templateId: "finder.move_item",
      parameters: {
        sourcePath: params.id,
        destPath: (params.properties.destPath as string) ?? "",
      },
    };
  }

  delete(id: string) {
    return { templateId: "finder.delete_item", parameters: { path: id } };
  }

  action(params: ActionParams) {
    switch (params.action) {
      case "show":
        return { templateId: "finder.show", parameters: params.parameters };
      case "reveal":
        return { templateId: "finder.reveal", parameters: params.parameters };
      case "move":
        return { templateId: "finder.move_item", parameters: params.parameters };
      case "duplicate":
        return { templateId: "finder.duplicate_item", parameters: params.parameters };
      default:
        throw new UnsupportedOperationError("finder", params.action);
    }
  }
}
