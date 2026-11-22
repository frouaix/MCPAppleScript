import {
  ResourceAdapter,
  AppInfo,
  ListParams,
  SearchParams,
  CreateParams,
  UpdateParams,
  ActionParams,
  UnsupportedOperationError,
  ValidationContext,
  ValidationResult,
} from "./types.js";
import { z } from "zod";
import { homedir } from "node:os";
import { resolve, join, dirname, basename, relative, isAbsolute, sep } from "node:path";
import { realpathSync } from "node:fs";
import { McpAppleScriptError } from "../util/errors.js";

/**
 * Finder adapter. Uses POSIX paths as IDs.
 * Containers are folders, items are files/folders within them.
 */
const finderPropertiesSchema = z
  .object({
    name: z.string().optional(),
    parentPath: z.string().optional(),
    destPath: z.string().optional(),
  })
  .passthrough();

/**
 * Resolve existing ancestors too, so nonexistent children cannot bypass the allowlist via a symlink.
 */
function normalizePath(raw: string): string {
  if (!raw || (raw.startsWith("~") && raw !== "~" && !raw.startsWith("~/"))) {
    throw new McpAppleScriptError("INVALID_REQUEST", "Expected a non-empty path or ~/ path.");
  }
  let path = resolve(
    raw === "~" ? homedir() : raw.startsWith("~/") ? join(homedir(), raw.slice(2)) : raw
  );
  const suffix: string[] = [];
  for (;;) {
    try {
      return join(realpathSync(path), ...suffix);
    } catch (error) {
      if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") {
        throw error;
      }
      const parent = dirname(path);
      if (parent === path) throw error;
      suffix.unshift(basename(path));
      path = parent;
    }
  }
}

function normalizeActionPaths(parameters: Record<string, unknown>): Record<string, unknown> {
  const normalized = { ...parameters };
  for (const key of ["path", "sourcePath", "destPath"]) {
    const value = parameters[key];
    if (value !== undefined) {
      if (typeof value !== "string") {
        throw new McpAppleScriptError("INVALID_REQUEST", `${key} must be a path string.`);
      }
      normalized[key] = normalizePath(value);
    }
  }
  return normalized;
}

export class FinderAdapter implements ResourceAdapter {
  readonly info: AppInfo = {
    name: "finder",
    displayName: "Finder",
    bundleId: "com.apple.finder",
    capabilities: {
      listContainers: true,
      list: true,
      get: true,
      search: true,
      create: true,
      update: true,
      delete: true,
      actions: ["show", "reveal", "move", "duplicate"],
    },
    itemType: "file",
    containerType: "folder",
    propertiesSchema: finderPropertiesSchema,
    requiredValidation: ["containerId", "id", "properties", "parameters"],
  };

  listContainers() {
    return { templateId: "finder.list_folders", parameters: { path: normalizePath("~") } };
  }

  list(params: ListParams) {
    return {
      templateId: "finder.list_items",
      parameters: {
        path: normalizePath(params.containerId ?? "~"),
        limit: params.limit ?? 50,
        offset: params.offset ?? 0,
      },
    };
  }

  get(id: string) {
    return { templateId: "finder.get_item", parameters: { path: normalizePath(id) } };
  }

  search(params: SearchParams) {
    return {
      templateId: "finder.search_items",
      parameters: {
        query: params.query,
        path: normalizePath(params.containerId ?? "~"),
        limit: params.limit ?? 20,
      },
    };
  }

  create(params: CreateParams) {
    return {
      templateId: "finder.create_folder",
      parameters: {
        name: params.properties.name ?? "",
        parentPath: normalizePath(params.containerId ?? "~"),
      },
    };
  }

  update(params: UpdateParams) {
    // Finder "update" = move or duplicate via action, but we support rename via the general pattern
    return {
      templateId: "finder.move_item",
      parameters: {
        sourcePath: normalizePath(params.id),
        destPath: normalizePath((params.properties.destPath as string) ?? ""),
      },
    };
  }

  delete(id: string) {
    return { templateId: "finder.delete_item", parameters: { path: normalizePath(id) } };
  }

  action(params: ActionParams) {
    switch (params.action) {
      case "show":
        return { templateId: "finder.show", parameters: normalizeActionPaths(params.parameters) };
      case "reveal":
        return { templateId: "finder.reveal", parameters: normalizeActionPaths(params.parameters) };
      case "move":
        return {
          templateId: "finder.move_item",
          parameters: normalizeActionPaths(params.parameters),
        };
      case "duplicate":
        return {
          templateId: "finder.duplicate_item",
          parameters: normalizeActionPaths(params.parameters),
        };
      default:
        throw new UnsupportedOperationError("finder", params.action);
    }
  }

  validateParams(params: Record<string, unknown>, context: ValidationContext): ValidationResult {
    const { allowedPaths } = context.finderConfig;

    // Empty allowlist = deny all
    if (allowedPaths.length === 0) {
      return {
        valid: false,
        error:
          'Finder access denied: no paths configured. Set "finder.allowedPaths" in config to enable Finder access (e.g. ["~/Documents", "~/Desktop"]).',
      };
    }

    const pathsToCheck: unknown[] = [];

    // containerId is used as path for list/search/create (defaults to "~")
    const containerId = params["containerId"] as string | undefined;
    if (containerId) {
      pathsToCheck.push(containerId);
    } else if ("containerId" in params) {
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
      if (typeof path !== "string") {
        return { valid: false, error: "Finder paths must be strings." };
      }
      const normalized = normalizePath(path);
      const isAllowed = allowedPaths.some((allowed) => {
        const normalizedAllowed = normalizePath(allowed);
        const remainder = relative(normalizedAllowed, normalized);
        return (
          remainder === "" ||
          (remainder !== ".." && !remainder.startsWith(`..${sep}`) && !isAbsolute(remainder))
        );
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
}
