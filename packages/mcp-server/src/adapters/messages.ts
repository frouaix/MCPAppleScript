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

const sendParameters = z
  .object({
    to: z.string().min(1).max(500),
    message: z.string().min(1).max(10000),
    service: z.enum(["iMessage", "SMS"]).optional(),
  })
  .strict();

/**
 * Messages adapter. Apple Messages has a limited AppleScript API:
 * - Read: list, get, and search chats; message history is not exposed
 * - Create: send message (via action)
 * - No update or delete support
 */
export class MessagesAdapter implements ResourceAdapter {
  readonly info: AppInfo = {
    name: "messages",
    displayName: "Apple Messages",
    bundleId: "com.apple.MobileSMS",
    capabilities: {
      listContainers: true,
      list: false,
      get: true,
      search: true,
      create: false,
      update: false,
      delete: false,
      actions: ["show", "send"],
    },
    itemType: "chat",
    containerType: "chat",
    requiredValidation: [],
  };

  listContainers() {
    return { templateId: "messages.list_chats", parameters: {} };
  }

  list(_params: ListParams): never {
    throw new UnsupportedOperationError("messages", "list message history");
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
      const result = sendParameters.safeParse(params.parameters);
      if (!result.success) {
        throw new McpAppleScriptError(
          "INVALID_REQUEST",
          `Invalid Messages send: ${result.error.message}`
        );
      }
      return { templateId: "messages.send", parameters: result.data };
    }
    throw new UnsupportedOperationError("messages", params.action);
  }
}
