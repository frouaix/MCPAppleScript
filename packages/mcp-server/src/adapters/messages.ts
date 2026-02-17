import {
  ResourceAdapter, AppInfo, ListParams, SearchParams,
  CreateParams, UpdateParams, ActionParams, UnsupportedOperationError,
} from "./types.js";

/**
 * Messages adapter. Apple Messages has a limited AppleScript API:
 * - Read: list chats, list messages in chat, get chat details, search chats
 * - Create: send message (via action)
 * - No update or delete support
 */
export class MessagesAdapter implements ResourceAdapter {
  readonly info: AppInfo = {
    name: "messages",
    displayName: "Apple Messages",
    bundleId: "com.apple.MobileSMS",
    capabilities: {
      listContainers: true, list: true, get: true, search: true,
      create: false, update: false, delete: false, actions: ["show", "send"],
    },
    itemType: "message",
    containerType: "chat",
  };

  listContainers() {
    return { templateId: "messages.list_chats", parameters: {} };
  }

  list(params: ListParams) {
    return {
      templateId: "messages.list_messages",
      parameters: {
        chatId: params.containerId ?? "",
        limit: params.limit ?? 50,
      },
    };
  }

  get(id: string) {
    return { templateId: "messages.get_chat", parameters: { chatId: id } };
  }

  search(params: SearchParams) {
    return {
      templateId: "messages.search_chats",
      parameters: {
        query: params.query,
        limit: params.limit ?? 20,
      },
    };
  }

  create(_params: CreateParams): never {
    throw new UnsupportedOperationError("messages", "create");
  }

  update(_params: UpdateParams): never {
    throw new UnsupportedOperationError("messages", "update");
  }

  delete(_id: string): never {
    throw new UnsupportedOperationError("messages", "delete");
  }

  action(params: ActionParams) {
    if (params.action === "show") {
      return { templateId: "messages.show", parameters: {} };
    }
    if (params.action === "send") {
      return { templateId: "messages.send", parameters: params.parameters };
    }
    throw new UnsupportedOperationError("messages", params.action);
  }
}
