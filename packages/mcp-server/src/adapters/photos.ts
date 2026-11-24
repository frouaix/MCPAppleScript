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
import { isAbsolute } from "node:path";
import { McpAppleScriptError } from "../util/errors.js";

const albumProperties = z.object({ name: z.string().trim().min(1).max(500) }).strict();
const importParameters = z
  .object({
    filePath: z.string().min(1).max(4096).refine(isAbsolute, "Must be an absolute path"),
    albumId: z.string().min(1).max(500).optional(),
  })
  .strict();

export class PhotosAdapter implements ResourceAdapter {
  readonly info: AppInfo = {
    name: "photos",
    displayName: "Apple Photos",
    bundleId: "com.apple.Photos",
    capabilities: {
      listContainers: true,
      list: true,
      get: true,
      search: true,
      create: true,
      update: false,
      delete: false,
      actions: ["show", "import"],
    },
    itemType: "media",
    containerType: "album",
    propertiesSchema: albumProperties,
    requiredValidation: [],
  };

  listContainers() {
    return { templateId: "photos.list_albums", parameters: {} };
  }

  list(params: ListParams) {
    return {
      templateId: "photos.list_items",
      parameters: {
        albumId: params.containerId ?? "",
        limit: params.limit ?? 50,
        offset: params.offset ?? 0,
      },
    };
  }

  get(id: string) {
    if (!id) throw new McpAppleScriptError("INVALID_REQUEST", "Photo ID is required.");
    return { templateId: "photos.get_item", parameters: { itemId: id } };
  }

  search(params: SearchParams) {
    if (!params.query)
      throw new McpAppleScriptError("INVALID_REQUEST", "Search query is required.");
    return {
      templateId: "photos.search_items",
      parameters: {
        query: params.query,
        albumId: params.containerId ?? "",
        limit: params.limit ?? 20,
        offset: params.offset ?? 0,
      },
    };
  }

  create(params: CreateParams) {
    const parsed = albumProperties.safeParse(params.properties);
    if (!parsed.success)
      throw new McpAppleScriptError("INVALID_REQUEST", `Invalid album: ${parsed.error.message}`);
    return {
      templateId: "photos.create_album",
      parameters: parsed.data,
    };
  }

  update(_params: UpdateParams): never {
    throw new UnsupportedOperationError("photos", "update");
  }

  delete(_id: string): never {
    throw new UnsupportedOperationError("photos", "delete");
  }

  action(params: ActionParams) {
    if (params.action === "show") {
      return { templateId: "photos.show", parameters: {} };
    }
    if (params.action === "import") {
      const parsed = importParameters.safeParse(params.parameters);
      if (!parsed.success)
        throw new McpAppleScriptError("INVALID_REQUEST", `Invalid import: ${parsed.error.message}`);
      return { templateId: "photos.import", parameters: parsed.data };
    }
    throw new UnsupportedOperationError("photos", params.action);
  }
}
