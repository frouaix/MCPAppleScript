import { McpServer, RegisteredTool } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Config } from "./config/schema.js";
import { PolicyEngine } from "./policy/policy.js";
import { ExecutorOptions } from "./exec/executor.js";
import { ExecutorRequest } from "./exec/types.js";
import { Logger } from "./util/logging.js";
import { randomUUID } from "node:crypto";
import {
  ModeManager,
  buildToolModeMap,
} from "./mode/mode.js";
import { ConfirmationManager } from "./mode/confirmation.js";
import {
  AppRegistry,
  NotesAdapter,
  CalendarAdapter,
  RemindersAdapter,
  MailAdapter,
  ContactsAdapter,
  MessagesAdapter,
  PhotosAdapter,
  MusicAdapter,
  FinderAdapter,
  SafariAdapter,
} from "./adapters/index.js";
import {
  registerSystemTools,
  registerCrudTools,
  registerScriptTools,
  ExecuteTemplateFn,
} from "./tools/index.js";

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
  appRegistry.register(new MailAdapter());
  appRegistry.register(new ContactsAdapter());
  appRegistry.register(new MessagesAdapter());
  appRegistry.register(new PhotosAdapter());
  appRegistry.register(new MusicAdapter());
  appRegistry.register(new FinderAdapter());
  appRegistry.register(new SafariAdapter());

  const server = new McpServer(
    { name: "mcp-applescript", version: VERSION },
    { capabilities: { tools: {} } }
  );

  const executorOptions: ExecutorOptions = {
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

  /** Execute a template via osascript and return MCP tool result. */
  const executeTemplate: ExecuteTemplateFn = async (
    templateId,
    bundleId,
    parameters,
    dryRun,
  ) => {
    const { runExecutor } = await import("./exec/executor.js");

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
        content: [{ type: "text", text: `Error: ${response.error.message}` }],
        isError: true,
      };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(response.result) }],
    };
  };

  // Register system tools (ping, get_mode, set_mode)
  const appNames = appRegistry.listApps().map((a) => a.name);
  registerSystemTools({ server, registerTool, modeManager, logger, appNames });

  // Register CRUD tools (list_containers, list, get, search, create, update, delete, action)
  registerCrudTools({ server, registerTool, appRegistry, policy, executeTemplate, confirmation, safariConfig: config.safari, finderConfig: config.finder });

  // Register script tools (run_template, run_script)
  registerScriptTools({ server, registerTool, policy, confirmation, config, executorOptions });

  // Wire up mode change callback to re-apply tool enable/disable
  modeManager.onModeChange(() => {
    applyMode();
    server.sendToolListChanged();
  });

  // Attach the low-level server to the confirmation manager for elicitation
  confirmation.attachServer(server.server);

  logger.info("MCP server created", {
    version: VERSION,
    mode: modeManager.getMode(),
    toolCount: registeredTools.size,
    enabledTools: modeManager.getEnabledTools(),
    apps: appNames,
  });

  return server;
}
