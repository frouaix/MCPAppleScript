import {
  ResourceAdapter, AppInfo, ListParams, SearchParams,
  CreateParams, UpdateParams, ActionParams, UnsupportedOperationError,
} from "./types.js";

export class ContactsAdapter implements ResourceAdapter {
  readonly info: AppInfo = {
    name: "contacts",
    displayName: "Apple Contacts",
    bundleId: "com.apple.Contacts",
    capabilities: {
      listContainers: true, list: true, get: true, search: true,
      create: true, update: true, delete: true, actions: ["show"],
    },
    itemType: "person",
    containerType: "group",
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
    return { templateId: "contacts.get_person", parameters: { personId: id } };
  }

  search(params: SearchParams) {
    return {
      templateId: "contacts.search_people",
      parameters: {
        query: params.query,
        groupId: params.containerId ?? "",
        limit: params.limit ?? 20,
      },
    };
  }

  create(params: CreateParams) {
    return {
      templateId: "contacts.create_person",
      parameters: {
        firstName: params.properties.firstName ?? "",
        lastName: params.properties.lastName ?? "",
        organization: params.properties.organization ?? "",
        email: params.properties.email ?? "",
        phone: params.properties.phone ?? "",
        groupId: params.containerId ?? "",
      },
    };
  }

  update(params: UpdateParams) {
    return {
      templateId: "contacts.update_person",
      parameters: {
        personId: params.id,
        ...params.properties,
      },
    };
  }

  delete(id: string) {
    return { templateId: "contacts.delete_person", parameters: { personId: id } };
  }

  action(params: ActionParams) {
    if (params.action === "show") {
      return { templateId: "contacts.show", parameters: {} };
    }
    throw new UnsupportedOperationError("contacts", params.action);
  }
}
