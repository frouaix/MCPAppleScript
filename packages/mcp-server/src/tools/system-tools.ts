import { McpServer, RegisteredTool } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { OperationMode, ALL_MODES } from "../mode/mode.js";
import { Logger } from "../util/logging.js";

const VERSION = "0.2.0";

export interface SystemToolDeps {
  server: McpServer;
  registerTool: (name: string, tool: RegisteredTool) => void;
  modeManager: import("../mode/mode.js").ModeManager;
  logger: Logger;
  appNames: string[];
}

export function registerSystemTools(deps: SystemToolDeps): void {
  const { server, registerTool, modeManager, logger, appNames } = deps;

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
        logger.info("Mode changed", {
          oldMode,
          newMode,
          enabledTools: modeManager.getEnabledTools(),
        });

        const enabledTools = modeManager.getEnabledTools();
        const disabledTools = modeManager.getDisabledTools();

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
}
