import {
  ResourceAdapter, AppInfo, ListParams, SearchParams,
  CreateParams, UpdateParams, ActionParams, UnsupportedOperationError,
} from "./types.js";

export class MailAdapter implements ResourceAdapter {
  readonly info: AppInfo = {
    name: "mail",
    displayName: "Apple Mail",
    bundleId: "com.apple.mail",
    capabilities: {
      listContainers: true, list: true, get: true, search: true,
      create: true, update: true, delete: true, actions: ["show", "send"],
    },
    itemType: "message",
    containerType: "mailbox",
  };

  listContainers() {
    return { templateId: "mail.list_mailboxes", parameters: {} };
  }

  list(params: ListParams) {
    return {
      templateId: "mail.list_messages",
      parameters: {
        mailboxName: params.containerId ?? "INBOX",
        limit: params.limit ?? 50,
        offset: params.offset ?? 0,
      },
    };
  }

  get(id: string) {
    return { templateId: "mail.get_message", parameters: { messageId: id } };
  }

  search(params: SearchParams) {
    return {
      templateId: "mail.search_messages",
      parameters: {
        query: params.query,
        limit: params.limit ?? 20,
      },
    };
  }

  create(params: CreateParams) {
    return {
      templateId: "mail.create_draft",
      parameters: {
        to: params.properties.to ?? "",
        subject: params.properties.subject ?? "",
        body: params.properties.body ?? "",
      },
    };
  }

  update(params: UpdateParams) {
    return {
      templateId: "mail.update_message",
      parameters: {
        messageId: params.id,
        ...params.properties,
      },
    };
  }

  delete(id: string) {
    return { templateId: "mail.delete_message", parameters: { messageId: id } };
  }

  action(params: ActionParams) {
    if (params.action === "show") {
      return { templateId: "mail.show", parameters: {} };
    }
    if (params.action === "send") {
      return { templateId: "mail.send", parameters: params.parameters };
    }
    throw new UnsupportedOperationError("mail", params.action);
  }
}
