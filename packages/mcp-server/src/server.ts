import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Config } from "./config/schema.js";
import { PolicyEngine } from "./policy/policy.js";
import { runExecutor, ExecutorOptions } from "./exec/executor.js";
import { ExecutorRequest } from "./exec/types.js";
import { Logger } from "./util/logging.js";
import { randomUUID } from "node:crypto";

const VERSION = "0.1.0";

export interface ServerDeps {
  config: Config;
  policy: PolicyEngine;
  logger: Logger;
}

export function createServer(deps: ServerDeps): McpServer {
  const { config, policy, logger } = deps;

  const server = new McpServer(
    { name: "mcp-applescript", version: VERSION },
    { capabilities: { tools: {} } }
  );

  const executorOptions: ExecutorOptions = {
    executablePath: config.executorPath,
    logger,
  };

  // --- applescript.ping ---
  server.tool("applescript.ping", "Check if the MCP-AppleScript server is running", async () => {
    return {
      content: [{ type: "text", text: JSON.stringify({ ok: true, version: VERSION }) }],
    };
  });

  // --- applescript.list_apps ---
  server.tool("applescript.list_apps", "List configured apps and their policy status", async () => {
    const apps = policy.getConfiguredApps().map((a) => ({
      bundleId: a.bundleId,
      enabled: a.config.enabled,
      allowedTools: a.config.allowedTools,
    }));
    return {
      content: [{ type: "text", text: JSON.stringify({ apps }, null, 2) }],
    };
  });

  // --- notes.create_note ---
  server.tool(
    "notes.create_note",
    "Create a new note in Apple Notes",
    { title: z.string().describe("Title of the note"), body: z.string().describe("Body content") },
    async ({ title, body }) => {
      const bundleId = "com.apple.Notes";
      policy.assertAllowed({ toolName: "notes.create_note", bundleId });

      const request: ExecutorRequest = {
        requestId: randomUUID(),
        bundleId,
        mode: "template",
        templateId: "notes.create_note.v1",
        parameters: { title, body },
        timeoutMs: config.defaultTimeoutMs,
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
  );

  // --- calendar.create_event ---
  server.tool(
    "calendar.create_event",
    "Create a new event in Apple Calendar",
    {
      title: z.string().describe("Event title"),
      start: z.string().describe("Start date/time (ISO 8601 or natural language)"),
      end: z.string().describe("End date/time (ISO 8601 or natural language)"),
      calendarName: z.string().optional().describe("Calendar name (default: Calendar)"),
      location: z.string().optional().describe("Event location"),
      notes: z.string().optional().describe("Event notes"),
    },
    async ({ title, start, end, calendarName, location, notes }) => {
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
  );

  // --- mail.compose_draft ---
  server.tool(
    "mail.compose_draft",
    "Compose a new email draft in Apple Mail",
    {
      to: z.string().describe("Recipient email address"),
      subject: z.string().optional().describe("Email subject"),
      body: z.string().optional().describe("Email body"),
    },
    async ({ to, subject, body }) => {
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
  );

  // --- applescript.run_template ---
  server.tool(
    "applescript.run_template",
    "Execute a registered AppleScript template by ID (policy-gated)",
    {
      templateId: z.string().describe("Template identifier (e.g. notes.create_note.v1)"),
      bundleId: z.string().describe("Target app bundle ID (e.g. com.apple.Notes)"),
      parameters: z.record(z.unknown()).optional().describe("Template parameters"),
    },
    async ({ templateId, bundleId, parameters }) => {
      policy.assertAllowed({ toolName: "applescript.run_template", bundleId });

      const request: ExecutorRequest = {
        requestId: randomUUID(),
        bundleId,
        mode: "template",
        templateId,
        parameters: parameters ?? {},
        timeoutMs: config.defaultTimeoutMs,
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
  );

  // --- applescript.run_script ---
  server.tool(
    "applescript.run_script",
    "Execute raw AppleScript (disabled by default, requires explicit config)",
    {
      script: z.string().describe("AppleScript source code to execute"),
      bundleId: z.string().optional().describe("Target app bundle ID for policy check"),
    },
    async ({ script, bundleId }) => {
      policy.assertAllowed({ toolName: "applescript.run_script", bundleId });

      const request: ExecutorRequest = {
        requestId: randomUUID(),
        bundleId: bundleId ?? "com.apple.systemevents",
        mode: "raw",
        script,
        parameters: {},
        timeoutMs: config.defaultTimeoutMs,
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
  );

  logger.info("MCP server created", {
    version: VERSION,
    executorPath: config.executorPath,
    toolCount: 7,
  });

  return server;
}
