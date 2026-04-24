/**
 * Common abstraction for Apple app resources exposed via AppleScript.
 *
 * Each app implements ResourceAdapter, mapping generic CRUD operations
 * to app-specific AppleScript templates. Apps that support only a subset
 * of operations throw UnsupportedOperationError for the rest.
 */

import { z } from "zod";

/** A container that holds items (folder, calendar, mailbox, playlist, etc.). */
export interface Container {
  id: string;
  name: string;
  type: string; // e.g. "folder", "calendar", "mailbox", "list", "album"
  itemCount?: number;
  parentId?: string;
}

/** A resource item within a container. */
export interface ResourceItem {
  id: string;
  name: string;
  type: string; // e.g. "note", "event", "message", "reminder", "person"
  containerId?: string;
  containerName?: string;
  createdAt?: string; // ISO 8601
  modifiedAt?: string; // ISO 8601
  /** App-specific properties beyond the common set. */
  properties: Record<string, unknown>;
}

/** Capabilities an adapter supports — drives which tools are available. */
export interface AdapterCapabilities {
  listContainers: boolean;
  list: boolean;
  get: boolean;
  search: boolean;
  create: boolean;
  update: boolean;
  delete: boolean;
  /** App-specific actions (e.g. "send", "play", "do_javascript"). */
  actions: string[];
}

/** Metadata about an app and its adapter. */
export interface AppInfo {
  /** Short name used as the `app` parameter (e.g. "notes", "calendar"). */
  name: string;
  /** Display name (e.g. "Apple Notes"). */
  displayName: string;
  /** macOS bundle ID. */
  bundleId: string;
  /** What this adapter can do. */
  capabilities: AdapterCapabilities;
  /** Description of items this app manages. */
  itemType: string;
  /** Description of containers this app uses. */
  containerType: string;
  /** Optional Zod schema for validating create/update properties. */
  propertiesSchema?: z.ZodType<Record<string, unknown>>;
}

/** Parameters for the list operation. */
export interface ListParams {
  containerId?: string;
  limit?: number;
  offset?: number;
}

/** Parameters for the search operation. */
export interface SearchParams {
  query: string;
  containerId?: string;
  limit?: number;
}

/** Parameters for the create operation. */
export interface CreateParams {
  containerId?: string;
  properties: Record<string, unknown>;
}

/** Parameters for the update operation. */
export interface UpdateParams {
  id: string;
  properties: Record<string, unknown>;
}

/** Parameters for an app-specific action. */
export interface ActionParams {
  action: string;
  parameters: Record<string, unknown>;
}

/** Result from an app-specific action. */
export interface ActionResult {
  success: boolean;
  message: string;
  data?: Record<string, unknown>;
}

/**
 * Common adapter interface that each Apple app implements.
 * All methods return template IDs and parameters for the executor.
 */
export interface ResourceAdapter {
  readonly info: AppInfo;

  listContainers(): { templateId: string; parameters: Record<string, unknown> };
  list(params: ListParams): { templateId: string; parameters: Record<string, unknown> };
  get(id: string): { templateId: string; parameters: Record<string, unknown> };
  search(params: SearchParams): { templateId: string; parameters: Record<string, unknown> };
  create(params: CreateParams): { templateId: string; parameters: Record<string, unknown> };
  update(params: UpdateParams): { templateId: string; parameters: Record<string, unknown> };
  delete(id: string): { templateId: string; parameters: Record<string, unknown> };
  action(params: ActionParams): { templateId: string; parameters: Record<string, unknown> };

  /**
   * Optional method for path validation. Adapters that operate on file system
   * paths implement this to restrict access to allowed paths.
   * Called before executing operations that access paths.
   * @throws Error if the path is not allowed
   */
  validatePath?(path: string, allowedPaths: string[]): void;
}

export class UnsupportedOperationError extends Error {
  constructor(app: string, operation: string) {
    super(`${app} does not support the "${operation}" operation`);
    this.name = "UnsupportedOperationError";
  }
}
