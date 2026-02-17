import {
  ResourceAdapter, AppInfo, ListParams, SearchParams,
  CreateParams, UpdateParams, ActionParams, UnsupportedOperationError,
} from "./types.js";

/**
 * Safari adapter. Tab/window browsing model, not traditional CRUD.
 * - Containers = windows, Items = tabs
 * - Create = open URL, Delete = close tab
 * - No "update" in the traditional sense
 * - Actions: do_javascript, add_reading_list
 */
export class SafariAdapter implements ResourceAdapter {
  readonly info: AppInfo = {
    name: "safari",
    displayName: "Safari",
    bundleId: "com.apple.Safari",
    capabilities: {
      listContainers: true, list: true, get: true, search: true,
      create: true, update: false, delete: true,
      actions: ["show", "do_javascript", "add_reading_list"],
    },
    itemType: "tab",
    containerType: "window",
  };

  listContainers() {
    return { templateId: "safari.list_windows", parameters: {} };
  }

  list(params: ListParams) {
    return {
      templateId: "safari.list_tabs",
      parameters: {
        windowId: params.containerId ? parseInt(params.containerId, 10) : 0,
      },
    };
  }

  get(id: string) {
    const parts = id.split(":");
    return {
      templateId: "safari.get_tab",
      parameters: {
        tabIndex: parseInt(parts[0], 10) || 1,
        windowId: parts[1] ? parseInt(parts[1], 10) : 0,
      },
    };
  }

  search(params: SearchParams) {
    return {
      templateId: "safari.search_tabs",
      parameters: {
        query: params.query,
        limit: params.limit ?? 20,
      },
    };
  }

  create(params: CreateParams) {
    return {
      templateId: "safari.open_url",
      parameters: {
        url: params.properties.url ?? "",
        newWindow: params.properties.newWindow ?? false,
      },
    };
  }

  update(_params: UpdateParams): never {
    throw new UnsupportedOperationError("safari", "update");
  }

  delete(id: string) {
    const parts = id.split(":");
    return {
      templateId: "safari.close_tab",
      parameters: {
        tabIndex: parseInt(parts[0], 10) || 1,
        windowId: parts[1] ? parseInt(parts[1], 10) : 0,
      },
    };
  }

  action(params: ActionParams) {
    switch (params.action) {
      case "show":
        return { templateId: "safari.show", parameters: {} };
      case "do_javascript":
        return { templateId: "safari.do_javascript", parameters: params.parameters };
      case "add_reading_list":
        return { templateId: "safari.add_reading_list", parameters: params.parameters };
      default:
        throw new UnsupportedOperationError("safari", params.action);
    }
  }
}
