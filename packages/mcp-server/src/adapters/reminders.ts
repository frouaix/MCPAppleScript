import {
  ResourceAdapter, AppInfo, ListParams, SearchParams,
  CreateParams, UpdateParams, ActionParams, UnsupportedOperationError,
} from "./types.js";

export class RemindersAdapter implements ResourceAdapter {
  readonly info: AppInfo = {
    name: "reminders",
    displayName: "Apple Reminders",
    bundleId: "com.apple.reminders",
    capabilities: {
      listContainers: true, list: true, get: true, search: true,
      create: true, update: true, delete: true, actions: ["show", "complete"],
    },
    itemType: "reminder",
    containerType: "list",
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
      },
    };
  }

  create(params: CreateParams) {
    return {
      templateId: "reminders.create_reminder",
      parameters: {
        listName: params.containerId ?? "",
        name: params.properties.name ?? "",
        body: params.properties.body ?? "",
        dueDate: params.properties.dueDate ?? "",
        priority: params.properties.priority ?? 0,
        flagged: params.properties.flagged ?? false,
      },
    };
  }

  update(params: UpdateParams) {
    return {
      templateId: "reminders.update_reminder",
      parameters: {
        reminderId: params.id,
        ...params.properties,
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
      return { templateId: "reminders.complete", parameters: params.parameters };
    }
    throw new UnsupportedOperationError("reminders", params.action);
  }
}
