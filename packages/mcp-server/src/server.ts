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
  isToolAllowedInMode,
} from "./mode/mode.js";
import { ConfirmationManager } from "./mode/confirmation.js";

const VERSION = "0.1.0";

export interface ServerDeps {
  config: Config;
  policy: PolicyEngine;
  logger: Logger;
}

export function createServer(deps: ServerDeps): McpServer {
  const { config, policy, logger } = deps;

  const modeManager = new ModeManager(config.defaultMode);
  const confirmation = new ConfirmationManager();

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
    // Disable tools not allowed in current mode at registration time
    if (!isToolAllowedInMode(name, modeManager.getMode())) {
      tool.disable();
    }
  }

  function applyMode(): void {
    for (const [name, tool] of registeredTools) {
      if (isToolAllowedInMode(name, modeManager.getMode())) {
        tool.enable();
      } else {
        tool.disable();
      }
    }
  }

  // --- applescript.ping ---
  registerTool(
    "applescript.ping",
    server.tool(
      "applescript.ping",
      "Check if the MCP-AppleScript server is running",
      { readOnlyHint: true },
      async () => ({
        content: [{ type: "text", text: JSON.stringify({ ok: true, version: VERSION }) }],
      })
    )
  );

  // --- applescript.list_apps ---
  registerTool(
    "applescript.list_apps",
    server.tool(
      "applescript.list_apps",
      "List configured apps and their policy status",
      { readOnlyHint: true },
      async () => {
        const apps = policy.getConfiguredApps().map((a) => ({
          bundleId: a.bundleId,
          enabled: a.config.enabled,
          allowedTools: a.config.allowedTools,
        }));
        return {
          content: [{ type: "text", text: JSON.stringify({ apps }, null, 2) }],
        };
      }
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
        // Notify client that tool list changed
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

  // Shared schema fragments
  const dryRunParam = z.boolean().optional().describe("If true, return the generated script without executing it");
  const MAX_TEXT = 10000;
  const MAX_TITLE = 500;

  // --- notes.create_note ---
  registerTool(
    "notes.create_note",
    server.tool(
      "notes.create_note",
      "Create a new note in Apple Notes",
      {
        title: z.string().max(MAX_TITLE).describe("Title of the note"),
        body: z.string().max(MAX_TEXT).describe("Body content"),
        dryRun: dryRunParam,
      },
      { readOnlyHint: false, destructiveHint: false },
      async ({ title, body, dryRun }) => {
        const bundleId = "com.apple.Notes";
        policy.assertAllowed({ toolName: "notes.create_note", bundleId });

        const request: ExecutorRequest = {
          requestId: randomUUID(),
          bundleId,
          mode: "template",
          templateId: "notes.create_note.v1",
          parameters: { title, body },
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
            { type: "text", text: `Created note "${title}"` },
            { type: "text", text: JSON.stringify(response.result) },
          ],
        };
      }
    )
  );

  // --- calendar.create_event ---
  registerTool(
    "calendar.create_event",
    server.tool(
      "calendar.create_event",
      "Create a new event in Apple Calendar",
      {
        title: z.string().max(MAX_TITLE).describe("Event title"),
        start: z.string().max(100).describe("Start date/time (ISO 8601 or natural language)"),
        end: z.string().max(100).describe("End date/time (ISO 8601 or natural language)"),
        calendarName: z.string().max(200).optional().describe("Calendar name (default: Calendar)"),
        location: z.string().max(500).optional().describe("Event location"),
        notes: z.string().max(MAX_TEXT).optional().describe("Event notes"),
        dryRun: dryRunParam,
      },
      { readOnlyHint: false, destructiveHint: false },
      async ({ title, start, end, calendarName, location, notes, dryRun }) => {
        const bundleId = "com.apple.iCal";
        policy.assertAllowed({ toolName: "calendar.create_event", bundleId });

        const request: ExecutorRequest = {
          requestId: randomUUID(),
          bundleId,
          mode: "template",
          templateId: "calendar.create_event.v1",
          parameters: {
            title,
            start,
            end,
            calendarName: calendarName ?? "Calendar",
            location: location ?? "",
            notes: notes ?? "",
          },
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
            { type: "text", text: `Created event "${title}" from ${start} to ${end}` },
            { type: "text", text: JSON.stringify(response.result) },
          ],
        };
      }
    )
  );

  // --- mail.compose_draft ---
  registerTool(
    "mail.compose_draft",
    server.tool(
      "mail.compose_draft",
      "Compose a new email draft in Apple Mail",
      {
        to: z.string().max(500).describe("Recipient email address"),
        subject: z.string().max(MAX_TITLE).optional().describe("Email subject"),
        body: z.string().max(MAX_TEXT).optional().describe("Email body"),
        dryRun: dryRunParam,
      },
      { readOnlyHint: false, destructiveHint: false },
      async ({ to, subject, body, dryRun }) => {
        const bundleId = "com.apple.mail";
        policy.assertAllowed({ toolName: "mail.compose_draft", bundleId });

        const request: ExecutorRequest = {
          requestId: randomUUID(),
          bundleId,
          mode: "template",
          templateId: "mail.compose_draft.v1",
          parameters: {
            to,
            subject: subject ?? "",
            body: body ?? "",
          },
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
            { type: "text", text: `Created email draft to ${to}` },
            { type: "text", text: JSON.stringify(response.result) },
          ],
        };
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
        templateId: z.string().max(200).describe("Template identifier (e.g. notes.create_note.v1)"),
        bundleId: z.string().max(200).describe("Target app bundle ID (e.g. com.apple.Notes)"),
        parameters: z.record(z.unknown()).optional().describe("Template parameters"),
        dryRun: dryRunParam,
      },
      { readOnlyHint: false, destructiveHint: true },
      async ({ templateId, bundleId, parameters, dryRun }) => {
        policy.assertAllowed({ toolName: "applescript.run_template", bundleId });

        const request: ExecutorRequest = {
          requestId: randomUUID(),
          bundleId,
          mode: "template",
          templateId,
          parameters: parameters ?? {},
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
            { type: "text", text: `Template ${templateId} executed successfully` },
            { type: "text", text: JSON.stringify(response.result) },
          ],
        };
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

        // Require confirmation for destructive action
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
  });

  return server;
}
