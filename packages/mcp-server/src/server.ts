import { McpServer, RegisteredTool } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Config } from "./config/schema.js";
import { PolicyEngine } from "./policy/policy.js";
import { runExecutor, ExecutorOptions } from "./exec/executor.js";
import { ExecutorRequest } from "./exec/types.js";
import { Logger } from "./util/logging.js";
import { randomUUID } from "node:crypto";
import {
  ModeManager,
  OperationMode,
  ALL_MODES,
  buildToolModeMap,
} from "./mode/mode.js";
import { ConfirmationManager } from "./mode/confirmation.js";
import {
  AppRegistry,
  NotesAdapter,
  CalendarAdapter,
  RemindersAdapter,
} from "./adapters/index.js";

const VERSION = "0.2.0";

export interface ServerDeps {
  config: Config;
  policy: PolicyEngine;
  logger: Logger;
}

export function createServer(deps: ServerDeps): McpServer {
  const { config, policy, logger } = deps;

  const modeManager = new ModeManager(config.defaultMode, buildToolModeMap(config.modes));
  const confirmation = new ConfirmationManager();

  // Build app registry with all supported adapters
  const appRegistry = new AppRegistry();
  appRegistry.register(new NotesAdapter());
  appRegistry.register(new CalendarAdapter());
  appRegistry.register(new RemindersAdapter());

  const server = new McpServer(
    { name: "mcp-applescript", version: VERSION },
    { capabilities: { tools: {} } }
  );

  const executorOptions: ExecutorOptions = {
    executablePath: config.executorPath,
    logger,
  };

  // Track registered tools for dynamic enable/disable
  const registeredTools = new Map<string, RegisteredTool>();

  function registerTool(name: string, tool: RegisteredTool): void {
    registeredTools.set(name, tool);
    if (!modeManager.isToolAllowedInMode(name, modeManager.getMode())) {
      tool.disable();
    }
  }

  function applyMode(): void {
    for (const [name, tool] of registeredTools) {
      if (modeManager.isToolAllowedInMode(name, modeManager.getMode())) {
        tool.enable();
      } else {
        tool.disable();
      }
    }
  }

  /** Execute a template via the Swift executor and return MCP tool result. */
  async function executeTemplate(
    templateId: string,
    bundleId: string,
    parameters: Record<string, unknown>,
    dryRun: boolean,
  ) {
    const request: ExecutorRequest = {
      requestId: randomUUID(),
      bundleId,
      mode: "template",
      templateId,
      parameters,
      timeoutMs: config.defaultTimeoutMs,
      dryRun,
    };
    const response = await runExecutor(request, executorOptions);
    if (!response.ok) {
      return {
        content: [{ type: "text" as const, text: `Error: ${response.error.message}` }],
        isError: true as const,
      };
    }
    return {
      content: [{ type: "text" as const, text: JSON.stringify(response.result) }],
    };
  }

  // Shared schema fragments
  const dryRunParam = z.boolean().optional().describe("If true, return the generated script without executing it");
  const appNames = appRegistry.listApps().map((a) => a.name);
  const appParam = z.enum(appNames as [string, ...string[]]).describe(
    `Target app: ${appNames.join(", ")}`
  );

  // --- applescript.ping ---
  registerTool(
    "applescript.ping",
    server.tool(
      "applescript.ping",
      "Check if the MCP-AppleScript server is running",
      { readOnlyHint: true },
      async () => ({
        content: [{ type: "text", text: JSON.stringify({ ok: true, version: VERSION, apps: appNames }) }],
      })
    )
  );

  // --- applescript.get_mode ---
  registerTool(
    "applescript.get_mode",
    server.tool(
      "applescript.get_mode",
      "Get the current operation mode (readonly, create, or full)",
      { readOnlyHint: true },
      async () => {
        const mode = modeManager.getMode();
        const enabledTools = modeManager.getEnabledTools();
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ mode, enabledTools, allModes: ALL_MODES }, null, 2),
            },
          ],
        };
      }
    )
  );

  // --- applescript.set_mode ---
  registerTool(
    "applescript.set_mode",
    server.tool(
      "applescript.set_mode",
      "Change the operation mode (readonly: read-only, create: allow creation, full: all operations including destructive)",
      {
        mode: z
          .enum(["readonly", "create", "full"])
          .describe("The operation mode to switch to"),
      },
      { readOnlyHint: false, destructiveHint: false },
      async ({ mode: newMode }) => {
        const { oldMode } = modeManager.setMode(newMode as OperationMode);
        applyMode();
        server.sendToolListChanged();

        const enabledTools = modeManager.getEnabledTools();
        const disabledTools = modeManager.getDisabledTools();
        logger.info("Mode changed", { oldMode, newMode, enabledTools });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                { oldMode, newMode, enabledTools, disabledTools },
                null,
                2
              ),
            },
          ],
        };
      }
    )
  );

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
        const { templateId, parameters } = adapter.create({ containerId, properties });
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

        const confirmResult = await confirmation.requestConfirmation(
          "app.update",
          `Update ${adapter.info.itemType} "${id}" in ${adapter.info.displayName}`,
          confirmationToken
        );
        if (!confirmResult.confirmed) {
          return { content: [{ type: "text" as const, text: confirmResult.message }] };
        }

        const { templateId, parameters } = adapter.update({ id, properties });
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
          return { content: [{ type: "text" as const, text: confirmResult.message }] };
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

  // --- applescript.run_template ---
  registerTool(
    "applescript.run_template",
    server.tool(
      "applescript.run_template",
      "Execute a registered AppleScript template by ID (policy-gated)",
      {
        templateId: z.string().max(200).describe("Template identifier (e.g. notes.list_notes)"),
        bundleId: z.string().max(200).describe("Target app bundle ID (e.g. com.apple.Notes)"),
        parameters: z.record(z.unknown()).optional().describe("Template parameters"),
        dryRun: dryRunParam,
      },
      { readOnlyHint: false, destructiveHint: true },
      async ({ templateId, bundleId, parameters, dryRun }) => {
        policy.assertAllowed({ toolName: "applescript.run_template", bundleId });
        return executeTemplate(templateId, bundleId, parameters ?? {}, dryRun ?? false);
      }
    )
  );

  // --- applescript.run_script ---
  registerTool(
    "applescript.run_script",
    server.tool(
      "applescript.run_script",
      "Execute raw AppleScript (requires full mode + explicit config). May cause data loss — confirmation required.",
      {
        script: z.string().max(50000).describe("AppleScript source code to execute"),
        bundleId: z.string().max(200).optional().describe("Target app bundle ID for policy check"),
        confirmationToken: z
          .string()
          .optional()
          .describe("Confirmation token from a previous call (required if elicitation unavailable)"),
        dryRun: dryRunParam,
      },
      { readOnlyHint: false, destructiveHint: true },
      async ({ script, bundleId, confirmationToken, dryRun }) => {
        policy.assertAllowed({ toolName: "applescript.run_script", bundleId });

        const confirmResult = await confirmation.requestConfirmation(
          "applescript.run_script",
          `Execute raw AppleScript targeting ${bundleId ?? "system"}:\n${script.slice(0, 200)}${script.length > 200 ? "..." : ""}`,
          confirmationToken
        );

        if (!confirmResult.confirmed) {
          return {
            content: [{ type: "text", text: confirmResult.message }],
          };
        }

        const request: ExecutorRequest = {
          requestId: randomUUID(),
          bundleId: bundleId ?? "com.apple.systemevents",
          mode: "raw",
          script,
          parameters: {},
          timeoutMs: config.defaultTimeoutMs,
          dryRun: dryRun ?? false,
        };

        const response = await runExecutor(request, executorOptions);
        if (!response.ok) {
          return {
            content: [{ type: "text", text: `Error: ${response.error.message}` }],
            isError: true,
          };
        }

        return {
          content: [
            { type: "text", text: "Script executed successfully" },
            { type: "text", text: JSON.stringify(response.result) },
          ],
        };
      }
    )
  );

  // Attach the low-level server to the confirmation manager for elicitation
  confirmation.attachServer(server.server);

  logger.info("MCP server created", {
    version: VERSION,
    mode: modeManager.getMode(),
    executorPath: config.executorPath,
    toolCount: registeredTools.size,
    enabledTools: modeManager.getEnabledTools(),
    apps: appNames,
  });

  return server;
}
