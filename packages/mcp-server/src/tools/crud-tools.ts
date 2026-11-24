import { McpServer, RegisteredTool } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { AppRegistry, ResourceAdapter, ValidationContext } from "../adapters/index.js";
import { PolicyEngine } from "../policy/policy.js";
import { AppNameSchema } from "../config/schema.js";
import { resolveEventRange, timestamp } from "./calendar-range.js";

export type ExecuteTemplateFn = (
  templateId: string,
  bundleId: string,
  parameters: Record<string, unknown>,
  dryRun: boolean
) => Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }>;

export interface CrudToolDeps {
  server: McpServer;
  registerTool: (name: string, tool: RegisteredTool) => void;
  appRegistry: AppRegistry;
  policy: PolicyEngine;
  executeTemplate: ExecuteTemplateFn;
  confirmation: import("../mode/confirmation.js").ConfirmationManager;
  validationContext: ValidationContext;
}

function createAppParam(apps: Array<(typeof AppNameSchema.options)[number]>) {
  const first = apps[0];
  return (first ? z.enum([first, ...apps.slice(1)]) : AppNameSchema).describe(
    `Authorized local apps: ${apps.join(", ")}`
  );
}

function validateProperties(
  adapter: ResourceAdapter,
  properties: unknown,
  operation: string
): Record<string, unknown> {
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

/**
 * Run adapter-level validation if the adapter has requiredValidation params.
 * Returns an error result if validation fails, or null if validation passes/skipped.
 */
export function runValidation(
  adapter: ResourceAdapter,
  rawParams: Record<string, unknown>,
  validationContext: ValidationContext
): { content: Array<{ type: "text"; text: string }>; isError: true } | null {
  const required = adapter.info.requiredValidation;
  if (!required || required.length === 0 || !adapter.validateParams) {
    return null;
  }

  const result = adapter.validateParams(rawParams, validationContext);
  if (!result.valid) {
    const error = result.error ?? "Validation failed.";
    return {
      content: [{ type: "text" as const, text: error }],
      isError: true as const,
    };
  }
  return null;
}

export function registerCrudTools(deps: CrudToolDeps): void {
  const {
    server,
    registerTool: trackTool,
    appRegistry,
    policy,
    executeTemplate,
    confirmation,
    validationContext,
  } = deps;
  const permissions = policy.getPermissions();
  const readableApps = AppNameSchema.options.filter((app) => permissions[app] !== "off");
  const writableApps = readableApps.filter((app) => permissions[app] === "readwrite");
  const actionApps = readableApps.filter(
    (app) => permissions[app] === "readwrite" || app === "music"
  );
  const appParam = createAppParam(readableApps);
  const writeAppParam = createAppParam(writableApps);
  const actionAppParam = createAppParam(actionApps);
  function registerTool(name: string, tool: RegisteredTool): void {
    const available =
      name === "app.action"
        ? actionApps.length > 0
        : ["app.create", "app.update", "app.delete"].includes(name)
          ? writableApps.length > 0
          : readableApps.length > 0;
    if (available) trackTool(name, tool);
    else tool.remove();
  }
  const dryRunParam = z
    .boolean()
    .optional()
    .describe("If true, return the execution plan without accessing app data");

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
        policy.assertAllowed({ toolName: "app.list_containers", app });

        const validationError = runValidation(
          adapter,
          { app, containerId: "~", dryRun },
          validationContext
        );
        if (validationError)
          return validationError as {
            content: Array<{ type: "text"; text: string }>;
            isError: true;
          };

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
      "List items (notes, events, reminders, etc.) in an Apple app, optionally within a container. Calendar requires startDate and endDate; alternatively use calendar.list_events.",
      {
        app: appParam,
        containerId: z
          .string()
          .max(500)
          .optional()
          .describe("Container ID to list items from (e.g. folder ID, calendar ID)"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(200)
          .optional()
          .describe("Max items to return (default: 50)"),
        offset: z.number().int().min(0).optional().describe("Offset for pagination (default: 0)"),
        startDate: timestamp.optional().describe("Calendar only: inclusive range start"),
        endDate: timestamp.optional().describe("Calendar only: exclusive range end"),
        dryRun: dryRunParam,
      },
      { readOnlyHint: true },
      async ({ app, containerId, limit, offset, startDate, endDate, dryRun }) => {
        const adapter = appRegistry.getOrThrow(app);
        policy.assertAllowed({ toolName: "app.list", app });

        const validationError = runValidation(
          adapter,
          { app, containerId, limit, offset, dryRun },
          validationContext
        );
        if (validationError)
          return validationError as {
            content: Array<{ type: "text"; text: string }>;
            isError: true;
          };

        const range = app === "calendar" ? resolveEventRange({ startDate, endDate }) : {};
        const { templateId, parameters } = adapter.list({ containerId, limit, offset, ...range });
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
        policy.assertAllowed({ toolName: "app.get", app });

        const validationError = runValidation(adapter, { app, id, dryRun }, validationContext);
        if (validationError)
          return validationError as {
            content: Array<{ type: "text"; text: string }>;
            isError: true;
          };

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
      "Search for items in an Apple app. Calendar searches event titles and requires startDate and endDate.",
      {
        app: appParam,
        query: z.string().max(500).describe("Search query"),
        containerId: z
          .string()
          .max(500)
          .optional()
          .describe("Limit search to a specific container"),
        limit: z.number().int().min(1).max(200).optional().describe("Max results (default: 20)"),
        offset: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe(
            "Calendar, Reminders, Contacts, and Photos only: pagination offset (default: 0)"
          ),
        startDate: timestamp.optional().describe("Calendar only: inclusive range start"),
        endDate: timestamp.optional().describe("Calendar only: exclusive range end"),
        dryRun: dryRunParam,
      },
      { readOnlyHint: true },
      async ({ app, query, containerId, limit, offset, startDate, endDate, dryRun }) => {
        const adapter = appRegistry.getOrThrow(app);
        policy.assertAllowed({ toolName: "app.search", app });

        const validationError = runValidation(
          adapter,
          { app, query, containerId, limit, offset, dryRun },
          validationContext
        );
        if (validationError)
          return validationError as {
            content: Array<{ type: "text"; text: string }>;
            isError: true;
          };

        const range = app === "calendar" ? resolveEventRange({ startDate, endDate }) : {};
        const { templateId, parameters } = adapter.search({
          query,
          containerId,
          limit,
          offset,
          ...range,
        });
        return executeTemplate(templateId, adapter.info.bundleId, parameters, dryRun ?? false);
      }
    )
  );

  // --- app.create ---
  registerTool(
    "app.create",
    server.tool(
      "app.create",
      "Create a new item in an Apple app (requires readwrite permission)",
      {
        app: writeAppParam,
        containerId: z
          .string()
          .max(500)
          .optional()
          .describe("Container to create in (e.g. folder name, calendar name, list name)"),
        properties: z
          .record(z.unknown())
          .describe("Item properties (app-specific: title, body, startDate, etc.)"),
        dryRun: dryRunParam,
      },
      { readOnlyHint: false, destructiveHint: false },
      async ({ app, containerId, properties, dryRun }) => {
        const adapter = appRegistry.getOrThrow(app);
        policy.assertAllowed({ toolName: "app.create", app });

        const validationError = runValidation(
          adapter,
          { app, containerId, properties, dryRun },
          validationContext
        );
        if (validationError)
          return validationError as {
            content: Array<{ type: "text"; text: string }>;
            isError: true;
          };

        const validatedProperties = validateProperties(adapter, properties, "create");
        const { templateId, parameters } = adapter.create({
          containerId,
          properties: validatedProperties,
        });
        return executeTemplate(templateId, adapter.info.bundleId, parameters, dryRun ?? false);
      }
    )
  );

  // --- app.update ---
  registerTool(
    "app.update",
    server.tool(
      "app.update",
      "Update an existing item (requires readwrite permission and user confirmation)",
      {
        app: writeAppParam,
        id: z.string().max(500).describe("Item ID to update"),
        properties: z.record(z.unknown()).describe("Properties to update"),
        dryRun: dryRunParam,
      },
      { readOnlyHint: false, destructiveHint: true },
      async ({ app, id, properties, dryRun }) => {
        const adapter = appRegistry.getOrThrow(app);
        policy.assertAllowed({ toolName: "app.update", app });

        const validationError = runValidation(
          adapter,
          { app, id, properties, dryRun },
          validationContext
        );
        if (validationError)
          return validationError as {
            content: Array<{ type: "text"; text: string }>;
            isError: true;
          };

        const validatedProperties = validateProperties(adapter, properties, "update");

        const { templateId, parameters } = adapter.update({ id, properties: validatedProperties });
        if (!dryRun) {
          const confirmResult = await confirmation.requestConfirmation(
            "app.update",
            JSON.stringify({ app, id, properties: validatedProperties })
          );
          if (!confirmResult.confirmed) {
            return { content: [{ type: "text", text: confirmResult.message }], isError: true };
          }
        }
        return executeTemplate(templateId, adapter.info.bundleId, parameters, dryRun ?? false);
      }
    )
  );

  // --- app.delete ---
  registerTool(
    "app.delete",
    server.tool(
      "app.delete",
      "Delete an item (requires readwrite permission and user confirmation)",
      {
        app: writeAppParam,
        id: z.string().max(500).describe("Item ID to delete"),
        dryRun: dryRunParam,
      },
      { readOnlyHint: false, destructiveHint: true },
      async ({ app, id, dryRun }) => {
        const adapter = appRegistry.getOrThrow(app);
        policy.assertAllowed({ toolName: "app.delete", app });

        const validationError = runValidation(adapter, { app, id, dryRun }, validationContext);
        if (validationError)
          return validationError as {
            content: Array<{ type: "text"; text: string }>;
            isError: true;
          };

        const { templateId, parameters } = adapter.delete(id);
        if (!dryRun) {
          const confirmResult = await confirmation.requestConfirmation(
            "app.delete",
            `Delete ${adapter.info.itemType} "${id}" from ${adapter.info.displayName}`
          );
          if (!confirmResult.confirmed) {
            return { content: [{ type: "text", text: confirmResult.message }], isError: true };
          }
        }
        return executeTemplate(templateId, adapter.info.bundleId, parameters, dryRun ?? false);
      }
    )
  );

  // --- app.action ---
  registerTool(
    "app.action",
    server.tool(
      "app.action",
      "Perform an app-specific action; requires readwrite except music now_playing. Sending, moving, and JavaScript require user confirmation.",
      {
        app: actionAppParam,
        action: z
          .string()
          .max(100)
          .describe("Action name (app-specific: show, complete, send, play, etc.)"),
        parameters: z.record(z.unknown()).optional().describe("Action parameters"),
        dryRun: dryRunParam,
      },
      { readOnlyHint: false, destructiveHint: true },
      async ({ app, action, parameters: actionParams, dryRun }) => {
        const adapter = appRegistry.getOrThrow(app);
        policy.assertAllowed({ toolName: "app.action", app, action });

        const validationError = runValidation(
          adapter,
          { app, action, parameters: actionParams, dryRun },
          validationContext
        );
        if (validationError)
          return validationError as {
            content: Array<{ type: "text"; text: string }>;
            isError: true;
          };

        const { templateId, parameters } = adapter.action({
          action,
          parameters: actionParams ?? {},
        });
        if (!dryRun && ["send", "move", "do_javascript"].includes(action)) {
          const confirmResult = await confirmation.requestConfirmation(
            "app.action",
            JSON.stringify({ app, action, parameters })
          );
          if (!confirmResult.confirmed) {
            return { content: [{ type: "text", text: confirmResult.message }], isError: true };
          }
        }
        return executeTemplate(templateId, adapter.info.bundleId, parameters, dryRun ?? false);
      }
    )
  );
}
