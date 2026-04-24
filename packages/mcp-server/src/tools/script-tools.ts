import { McpServer, RegisteredTool } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { PolicyEngine } from "../policy/policy.js";
import { runExecutor, ExecutorOptions } from "../exec/executor.js";
import { ExecutorRequest } from "../exec/types.js";
import { Config } from "../config/schema.js";

export interface ScriptToolDeps {
  server: McpServer;
  registerTool: (name: string, tool: RegisteredTool) => void;
  policy: PolicyEngine;
  confirmation: import("../mode/confirmation.js").ConfirmationManager;
  config: Config;
  executorOptions: ExecutorOptions;
}

export function registerScriptTools(deps: ScriptToolDeps): void {
  const { server, registerTool, policy, confirmation, config, executorOptions } = deps;
  const dryRunParam = z.boolean().optional().describe("If true, return the generated script without executing it");

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
          content: [{ type: "text", text: JSON.stringify(response.result) }],
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
}
