#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config/config.js";
import { PolicyEngine } from "./policy/policy.js";
import { Logger } from "./util/logging.js";
import { createServer } from "./server.js";

async function main() {
  const config = loadConfig();
  const logger = new Logger(config.logging);
  const policy = new PolicyEngine(config, logger);

  logger.info("Starting MCP-AppleScript server");

  const server = createServer({ config, policy, logger });
  const transport = new StdioServerTransport();
  await server.connect(transport);

  logger.info("MCP-AppleScript server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
