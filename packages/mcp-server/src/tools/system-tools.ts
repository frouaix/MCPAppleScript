import { McpServer, RegisteredTool } from "@modelcontextprotocol/sdk/server/mcp.js";
import { PolicyEngine } from "../policy/policy.js";

const VERSION = "0.2.0";

export interface SystemToolDeps {
  server: McpServer;
  registerTool: (name: string, tool: RegisteredTool) => void;
  policy: PolicyEngine;
  appNames: string[];
}

export function registerSystemTools(deps: SystemToolDeps): void {
  const { server, registerTool, policy, appNames } = deps;
  registerTool(
    "applescript.ping",
    server.tool(
      "applescript.ping",
      "Check server health and supported apps",
      { readOnlyHint: true },
      async () => ({
        content: [
          { type: "text", text: JSON.stringify({ ok: true, version: VERSION, apps: appNames }) },
        ],
      })
    )
  );
  registerTool(
    "applescript.get_permissions",
    server.tool(
      "applescript.get_permissions",
      "Inspect this instance's immutable effective app permissions and selected profile",
      { readOnlyHint: true },
      async () => ({
        content: [
          {
            type: "text",
            text: JSON.stringify({
              profile: policy.profile ?? null,
              permissions: policy.getPermissions(),
            }),
          },
        ],
      })
    )
  );
}
