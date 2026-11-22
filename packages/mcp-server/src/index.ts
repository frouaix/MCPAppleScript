#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config/config.js";
import { Logger } from "./util/logging.js";
import { createServer } from "./server.js";
import { parseArgs } from "./cli.js";

async function main() {
  const flags = parseArgs(process.argv.slice(2));
  if (flags.help) {
    console.log(
      "Usage: mcp-applescript [--profile NAME]\n\nStdio only. Permissions are fixed at startup.\nWithout --profile, uses the global permissions. Profiles can only narrow those grants."
    );
    return;
  }

  const config = loadConfig();
  const logger = new Logger(config.logging);

  logger.info("Starting MCP-AppleScript server");

  const server = createServer({ config, logger, profile: flags.profile });
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
