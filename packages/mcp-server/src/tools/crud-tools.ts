import { McpServer, RegisteredTool } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { AppRegistry, ResourceAdapter } from "../adapters/index.js";
import { PolicyEngine } from "../policy/policy.js";

export type ExecuteTemplateFn = (
  templateId: string,
  bundleId: string,
  parameters: Record<string, unknown>,
  dryRun: boolean
) => Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }>;

export interface CrudToolDeps {
  server: McpServer;
  registerTool: (name: string, tool: RegisteredTool) => void;
  appRegistry: AppRegistry;
  policy: PolicyEngine;
  executeTemplate: ExecuteTemplateFn;
  confirmation: import("../mode/confirmation.js").ConfirmationManager;
}

function createAppParam(appRegistry: AppRegistry) {
  const appNames = appRegistry.listApps().map((a) => a.name);
  return z.enum(appNames as [string, ...string[]]).describe(
    `Target app: ${appNames.join(", ")}`
  );
}

function validateProperties(adapter: ResourceAdapter, properties: unknown, operation: string): Record<string, unknown> {
  const schema = adapter.info.propertiesSchema;
  if (schema) {
    const result = schema.safeParse(properties);
    if (!result.success) {
      const fields = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ");
      throw new Error(`Invalid ${operation} properties for ${adapter.info.displayName}: ${fields}`);
    }
    return result.data;
  }
  return properties as Record<string, unknown>;
}

export function registerCrudTools(deps: CrudToolDeps): void {
  const { server, registerTool, appRegistry, policy, executeTemplate, confirmation } = deps;
  const appParam = createAppParam(appRegistry);
  const dryRunParam = z.boolean().optional().describe("If true, return the generated script without executing it");

  // --- app.list_containers ---
  registerTool(
    "app.list_containers",
    server.tool(
      "app.list_containers",
      "List containers (folders, calendars, lists, etc.) for an Apple app",
      {
        app: appParam,
        dryRun: dryRunParam,
      },
      { readOnlyHint: true },
      async ({ app, dryRun }) => {
        const adapter = appRegistry.getOrThrow(app);
        policy.assertAllowed({ toolName: "app.list_containers", bundleId: adapter.info.bundleId });
        const { templateId, parameters } = adapter.listContainers();
        return executeTemplate(templateId, adapter.info.bundleId, parameters, dryRun ?? false);
      }
    )
  );

  // --- app.list ---
  registerTool(
    "app.list",
    server.tool(
      "app.list",
      "List items (notes, events, reminders, etc.) in an Apple app, optionally within a container",
      {
        app: appParam,
        containerId: z.string().max(500).optional().describe("Container ID to list items from (e.g. folder ID, calendar ID)"),
        limit: z.number().int().min(1).max(200).optional().describe("Max items to return (default: 50)"),
        offset: z.number().int().min(0).optional().describe("Offset for pagination (default: 0)"),
        dryRun: dryRunParam,
      },
      { readOnlyHint: true },
      async ({ app, containerId, limit, offset, dryRun }) => {
        const adapter = appRegistry.getOrThrow(app);
        policy.assertAllowed({ toolName: "app.list", bundleId: adapter.info.bundleId });
        const { templateId, parameters } = adapter.list({ containerId, limit, offset });
        return executeTemplate(templateId, adapter.info.bundleId, parameters, dryRun ?? false);
      }
    )
  );

  // --- app.get ---
  registerTool(
    "app.get",
    server.tool(
      "app.get",
      "Get a single item by ID from an Apple app",
      {
        app: appParam,
        id: z.string().max(500).describe("Item ID"),
        dryRun: dryRunParam,
      },
      { readOnlyHint: true },
      async ({ app, id, dryRun }) => {
        const adapter = appRegistry.getOrThrow(app);
        policy.assertAllowed({ toolName: "app.get", bundleId: adapter.info.bundleId });
        const { templateId, parameters } = adapter.get(id);
        return executeTemplate(templateId, adapter.info.bundleId, parameters, dryRun ?? false);
      }
    )
  );

  // --- app.search ---
  registerTool(
    "app.search",
    server.tool(
      "app.search",
      "Search for items in an Apple app",
      {
        app: appParam,
        query: z.string().max(500).describe("Search query"),
        containerId: z.string().max(500).optional().describe("Limit search to a specific container"),
        limit: z.number().int().min(1).max(200).optional().describe("Max results (default: 20)"),
        dryRun: dryRunParam,
      },
      { readOnlyHint: true },
      async ({ app, query, containerId, limit, dryRun }) => {
        const adapter = appRegistry.getOrThrow(app);
        policy.assertAllowed({ toolName: "app.search", bundleId: adapter.info.bundleId });
        const { templateId, parameters } = adapter.search({ query, containerId, limit });
        return executeTemplate(templateId, adapter.info.bundleId, parameters, dryRun ?? false);
      }
    )
  );

  // --- app.create ---
  registerTool(
    "app.create",
    server.tool(
      "app.create",
      "Create a new item in an Apple app (requires create mode)",
      {
        app: appParam,
        containerId: z.string().max(500).optional().describe("Container to create in (e.g. folder name, calendar name, list name)"),
        properties: z.record(z.unknown()).describe("Item properties (app-specific: title, body, startDate, etc.)"),
        dryRun: dryRunParam,
      },
      { readOnlyHint: false, destructiveHint: false },
      async ({ app, containerId, properties, dryRun }) => {
        const adapter = appRegistry.getOrThrow(app);
        policy.assertAllowed({ toolName: "app.create", bundleId: adapter.info.bundleId });
        const validatedProperties = validateProperties(adapter, properties, "create");
        const { templateId, parameters } = adapter.create({ containerId, properties: validatedProperties });
        return executeTemplate(templateId, adapter.info.bundleId, parameters, dryRun ?? false);
      }
    )
  );

  // --- app.update ---
  registerTool(
    "app.update",
    server.tool(
      "app.update",
      "Update an existing item in an Apple app (requires full mode, confirmation required)",
      {
        app: appParam,
        id: z.string().max(500).describe("Item ID to update"),
        properties: z.record(z.unknown()).describe("Properties to update"),
        confirmationToken: z.string().optional().describe("Confirmation token from a previous call"),
        dryRun: dryRunParam,
      },
      { readOnlyHint: false, destructiveHint: true },
      async ({ app, id, properties, confirmationToken, dryRun }) => {
        const adapter = appRegistry.getOrThrow(app);
        policy.assertAllowed({ toolName: "app.update", bundleId: adapter.info.bundleId });

        const validatedProperties = validateProperties(adapter, properties, "update");

        const confirmResult = await confirmation.requestConfirmation(
          "app.update",
          `Update ${adapter.info.itemType} "${id}" in ${adapter.info.displayName}`,
          confirmationToken
        );
        if (!confirmResult.confirmed) {
          return { content: [{ type: "text", text: confirmResult.message }] };
        }

        const { templateId, parameters } = adapter.update({ id, properties: validatedProperties });
        return executeTemplate(templateId, adapter.info.bundleId, parameters, dryRun ?? false);
      }
    )
  );

  // --- app.delete ---
  registerTool(
    "app.delete",
    server.tool(
      "app.delete",
      "Delete an item from an Apple app (requires full mode, confirmation required)",
      {
        app: appParam,
        id: z.string().max(500).describe("Item ID to delete"),
        confirmationToken: z.string().optional().describe("Confirmation token from a previous call"),
        dryRun: dryRunParam,
      },
      { readOnlyHint: false, destructiveHint: true },
      async ({ app, id, confirmationToken, dryRun }) => {
        const adapter = appRegistry.getOrThrow(app);
        policy.assertAllowed({ toolName: "app.delete", bundleId: adapter.info.bundleId });

        const confirmResult = await confirmation.requestConfirmation(
          "app.delete",
          `Delete ${adapter.info.itemType} "${id}" from ${adapter.info.displayName}`,
          confirmationToken
        );
        if (!confirmResult.confirmed) {
          return { content: [{ type: "text", text: confirmResult.message }] };
        }

        const { templateId, parameters } = adapter.delete(id);
        return executeTemplate(templateId, adapter.info.bundleId, parameters, dryRun ?? false);
      }
    )
  );

  // --- app.action ---
  registerTool(
    "app.action",
    server.tool(
      "app.action",
      "Perform an app-specific action (e.g. show, complete, send)",
      {
        app: appParam,
        action: z.string().max(100).describe("Action name (app-specific: show, complete, send, play, etc.)"),
        parameters: z.record(z.unknown()).optional().describe("Action parameters"),
        dryRun: dryRunParam,
      },
      { readOnlyHint: false, destructiveHint: false },
      async ({ app, action, parameters: actionParams, dryRun }) => {
        const adapter = appRegistry.getOrThrow(app);
        policy.assertAllowed({ toolName: "app.action", bundleId: adapter.info.bundleId });
        const { templateId, parameters } = adapter.action({ action, parameters: actionParams ?? {} });
        return executeTemplate(templateId, adapter.info.bundleId, parameters, dryRun ?? false);
      }
    )
  );
}
