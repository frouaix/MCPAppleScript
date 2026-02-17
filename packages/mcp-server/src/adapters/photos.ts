import {
  ResourceAdapter, AppInfo, ListParams, SearchParams,
  CreateParams, UpdateParams, ActionParams, UnsupportedOperationError,
} from "./types.js";

/**
 * Photos adapter. Limited AppleScript API:
 * - Read: list albums, list media items, get item, search by description
 * - Create: create album (items are created via import action)
 * - No update/delete of individual photos
 */
export class PhotosAdapter implements ResourceAdapter {
  readonly info: AppInfo = {
    name: "photos",
    displayName: "Apple Photos",
    bundleId: "com.apple.Photos",
    capabilities: {
      listContainers: true, list: true, get: true, search: true,
      create: true, update: false, delete: false, actions: ["show", "import"],
    },
    itemType: "media",
    containerType: "album",
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
    return { templateId: "photos.get_item", parameters: { itemId: id } };
  }

  search(params: SearchParams) {
    return {
      templateId: "photos.search_items",
      parameters: {
        query: params.query,
        limit: params.limit ?? 20,
      },
    };
  }

  create(params: CreateParams) {
    return {
      templateId: "photos.create_album",
      parameters: { name: params.properties.name ?? "" },
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
      return { templateId: "photos.import", parameters: params.parameters };
    }
    throw new UnsupportedOperationError("photos", params.action);
  }
}
