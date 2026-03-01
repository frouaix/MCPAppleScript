#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config/config.js";
import { PolicyEngine } from "./policy/policy.js";
import { Logger } from "./util/logging.js";
import { createServer } from "./server.js";

function parseArgs() {
  const args = process.argv.slice(2);
  let http = false;
  let port = 3000;
  let host = "127.0.0.1";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--http") {
      http = true;
    } else if (args[i] === "--port" && args[i + 1]) {
      port = parseInt(args[i + 1]!, 10);
      i++;
    } else if (args[i] === "--host" && args[i + 1]) {
      host = args[i + 1]!;
      i++;
    }
  }

  return { http, port, host };
}

async function main() {
  const flags = parseArgs();

  if (flags.http) {
    const { startHttp } = await import("./http.js");
    await startHttp({ port: flags.port, host: flags.host });
    return;
  }

  const config = loadConfig();
  const logger = new Logger(config.logging);
  const policy = new PolicyEngine(config, logger);

  logger.info("Starting MCP-AppleScript server");

  const server = createServer({ config, policy, logger });
  const transport = new StdioServerTransport();

  server.server.onerror = (err) => {
    logger.error("MCP server error", { error: String(err) });
  };

  await server.connect(transport);

  logger.info("MCP-AppleScript server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
