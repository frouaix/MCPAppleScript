import {
  ResourceAdapter, AppInfo, ListParams, SearchParams,
  CreateParams, UpdateParams, ActionParams,
  UnsupportedOperationError, ValidationContext, ValidationResult,
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
    requiredValidation: ["containerId", "id", "properties", "parameters"],
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

  validateParams(
    params: Record<string, unknown>,
    context: ValidationContext
  ): ValidationResult {
    const { allowedPaths } = context.finderConfig;

    // Empty allowlist = deny all
    if (allowedPaths.length === 0) {
      return {
        valid: false,
        error: 'Finder access denied: no paths configured. Set "finder.allowedPaths" in config to enable Finder access (e.g. ["~/Documents", "~/Desktop"]).',
      };
    }

    const pathsToCheck: string[] = [];

    // containerId is used as path for list/search/create (defaults to "~")
    const containerId = params["containerId"] as string | undefined;
    if (containerId) {
      pathsToCheck.push(containerId);
    } else if (params["containerId"] !== undefined || this._hasListContainersParam(params)) {
      pathsToCheck.push("~");
    }

    // id is used as path for get/delete
    const id = params["id"] as string | undefined;
    if (id) {
      pathsToCheck.push(id);
    }

    // properties may contain parentPath (create) or destPath (update)
    const properties = params["properties"] as Record<string, unknown> | undefined;
    if (properties) {
      const pp = properties["parentPath"] as string | undefined;
      if (pp) pathsToCheck.push(pp);
      const dp = properties["destPath"] as string | undefined;
      if (dp) pathsToCheck.push(dp);
    }

    // action parameters may contain path, sourcePath, destPath
    const actionParams = params["parameters"] as Record<string, unknown> | undefined;
    if (actionParams) {
      for (const key of ["path", "sourcePath", "destPath"]) {
        const val = actionParams[key] as string | undefined;
        if (val) pathsToCheck.push(val);
      }
    }

    // Validate each path against the allowlist
    for (const path of pathsToCheck) {
      const normalized = normalizePath(path);
      const isAllowed = allowedPaths.some((allowed) => {
        const normalizedAllowed = normalizePath(allowed);
        return normalized === normalizedAllowed || normalized.startsWith(normalizedAllowed + "/");
      });
      if (!isAllowed) {
        return {
          valid: false,
          error: `Finder access denied: path "${path}" is not within any allowed path. Allowed paths: ${allowedPaths.join(", ")}`,
        };
      }
    }

    return { valid: true };
  }

  // Track whether we've seen a containerId param to distinguish
  // between "not provided" and "provided but empty"
  private _hasListContainersParam(params: Record<string, unknown>): boolean {
    // list_containers handler passes { app, dryRun } only
    // We detect this by checking if containerId was explicitly passed
    return "containerId" in params;
  }
}
