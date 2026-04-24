import {
  ResourceAdapter, AppInfo, ListParams, SearchParams,
  CreateParams, UpdateParams, ActionParams, UnsupportedOperationError,
} from "./types.js";
import { z } from "zod";
import { homedir } from "node:os";
import { resolve, join } from "node:path";

/**
 * Finder adapter. Uses POSIX paths as IDs.
 * Containers are folders, items are files/folders within them.
 */
const finderPropertiesSchema = z.object({
  name: z.string().optional(),
  parentPath: z.string().optional(),
  destPath: z.string().optional(),
}).passthrough();

/**
 * Normalize a path for allowlist comparison:
 * - Resolve ~ to home directory
 * - Resolve relative paths
 * - Normalize trailing slashes
 */
function normalizePath(raw: string): string {
  let p = raw.trim();

  // Resolve ~ to home directory
  if (p.startsWith("~")) {
    const relative = p.slice(1);
    p = join(homedir(), relative);
  }

  // Resolve relative paths
  if (!p.startsWith("/")) {
    p = resolve(process.cwd(), p);
  }

  // Normalize trailing slashes (except for root)
  if (p !== "/") {
    p = p.replace(/\/+$/, "");
  }

  return p;
}

/**
 * Validate that a path is within the allowed paths.
 * Default behavior: if allowedPaths is empty, deny all.
 */
function validateFinderPath(path: string, allowedPaths: string[]): void {
  const normalized = normalizePath(path);

  // Empty allowlist = deny all
  if (allowedPaths.length === 0) {
    throw new Error(
      `Finder access denied: path "${path}" is not allowed. ` +
      "Configure allowedPaths in finder section of config to enable Finder access."
    );
  }

  // Check if path starts with any allowed path
  const isAllowed = allowedPaths.some((allowed) => {
    const normalizedAllowed = normalizePath(allowed);
    return normalized === normalizedAllowed || normalized.startsWith(normalizedAllowed + "/");
  });

  if (!isAllowed) {
    throw new Error(
      `Finder access denied: path "${path}" is not within any allowed path. ` +
      `Allowed paths: ${allowedPaths.join(", ")}`
    );
  }
}

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
    propertiesSchema: finderPropertiesSchema,
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

  validatePath(path: string, allowedPaths: string[]): void {
    validateFinderPath(path, allowedPaths);
  }
}
