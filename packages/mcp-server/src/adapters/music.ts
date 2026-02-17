import {
  ResourceAdapter, AppInfo, ListParams, SearchParams,
  CreateParams, UpdateParams, ActionParams, UnsupportedOperationError,
} from "./types.js";

/**
 * Music adapter. Playback-focused API with CRUD for playlists.
 * No update/delete of individual tracks (they're managed by the library).
 */
export class MusicAdapter implements ResourceAdapter {
  readonly info: AppInfo = {
    name: "music",
    displayName: "Apple Music",
    bundleId: "com.apple.Music",
    capabilities: {
      listContainers: true, list: true, get: true, search: true,
      create: true, update: false, delete: false,
      actions: ["show", "play", "pause", "next", "previous", "now_playing"],
    },
    itemType: "track",
    containerType: "playlist",
  };

  listContainers() {
    return { templateId: "music.list_playlists", parameters: {} };
  }

  list(params: ListParams) {
    return {
      templateId: "music.list_tracks",
      parameters: {
        playlistId: params.containerId ?? "",
        limit: params.limit ?? 50,
        offset: params.offset ?? 0,
      },
    };
  }

  get(id: string) {
    return { templateId: "music.get_track", parameters: { trackId: id } };
  }

  search(params: SearchParams) {
    return {
      templateId: "music.search_tracks",
      parameters: {
        query: params.query,
        limit: params.limit ?? 20,
      },
    };
  }

  create(params: CreateParams) {
    return {
      templateId: "music.create_playlist",
      parameters: {
        name: params.properties.name ?? "",
        description: params.properties.description ?? "",
      },
    };
  }

  update(_params: UpdateParams): never {
    throw new UnsupportedOperationError("music", "update");
  }

  delete(_id: string): never {
    throw new UnsupportedOperationError("music", "delete");
  }

  action(params: ActionParams) {
    switch (params.action) {
      case "show":
        return { templateId: "music.show", parameters: {} };
      case "play":
        return { templateId: "music.play", parameters: params.parameters };
      case "pause":
        return { templateId: "music.pause", parameters: {} };
      case "next":
        return { templateId: "music.next", parameters: {} };
      case "previous":
        return { templateId: "music.previous", parameters: {} };
      case "now_playing":
        return { templateId: "music.now_playing", parameters: {} };
      default:
        throw new UnsupportedOperationError("music", params.action);
    }
  }
}
