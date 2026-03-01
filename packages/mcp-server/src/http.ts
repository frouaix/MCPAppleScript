/**
 * Streamable HTTP transport for the MCP server.
 *
 * Usage: node dist/index.js --http [--port 3000] [--host 127.0.0.1]
 */

import express from "express";
import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { loadConfig } from "./config/config.js";
import { PolicyEngine } from "./policy/policy.js";
import { Logger } from "./util/logging.js";
import { createServer } from "./server.js";

export interface HttpOptions {
  port: number;
  host: string;
}

export async function startHttp(opts: HttpOptions): Promise<void> {
  const config = loadConfig();
  const logger = new Logger(config.logging);
  const policy = new PolicyEngine(config, logger);

  const app = express();
  app.use(express.json());

  // Map of session ID → transport
  const sessions = new Map<string, StreamableHTTPServerTransport>();

  app.all("/mcp", async (req, res) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    if (req.method === "GET" || req.method === "DELETE") {
      // GET opens SSE stream, DELETE closes session
      if (!sessionId || !sessions.has(sessionId)) {
        res.status(400).json({ error: "Invalid or missing session ID" });
        return;
      }
      const transport = sessions.get(sessionId)!;
      await transport.handleRequest(req, res);
      if (req.method === "DELETE") {
        sessions.delete(sessionId);
        logger.debug("Session deleted", { sessionId });
      }
      return;
    }

    // POST — either initialize or continue
    if (sessionId && sessions.has(sessionId)) {
      const transport = sessions.get(sessionId)!;
      await transport.handleRequest(req, res);
      return;
    }

    // New session — create transport and MCP server
    const newSessionId = randomUUID();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => newSessionId,
      onsessioninitialized: (id) => {
        logger.debug("Session initialized", { sessionId: id });
      },
    });

    sessions.set(newSessionId, transport);

    const server = createServer({ config, policy, logger });
    server.server.onerror = (err) => {
      logger.error("MCP server error", { error: String(err), sessionId: newSessionId });
    };

    await server.connect(transport);

    transport.onclose = () => {
      sessions.delete(newSessionId);
      logger.debug("Session closed", { sessionId: newSessionId });
    };

    await transport.handleRequest(req, res);
  });

  // Health check
  app.get("/health", (_req, res) => {
    res.json({ ok: true, sessions: sessions.size });
  });

  app.listen(opts.port, opts.host, () => {
    logger.info(`MCP-AppleScript HTTP server listening on http://${opts.host}:${opts.port}/mcp`);
    // Also log to stderr so the MCP client can discover the URL
    console.error(`MCP-AppleScript HTTP server listening on http://${opts.host}:${opts.port}/mcp`);
  });
}
