import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ElicitRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { AppRegistry, NotesAdapter, MailAdapter } from "../../src/adapters/index.js";
import { ConfigSchema } from "../../src/config/schema.js";
import { PolicyEngine } from "../../src/policy/policy.js";
import { Logger } from "../../src/util/logging.js";
import { ConfirmationManager } from "../../src/mode/confirmation.js";
import { registerCrudTools } from "../../src/tools/crud-tools.js";

describe("CRUD user confirmation boundary", () => {
  for (const decision of ["accept", "decline", "cancel"] as const) {
    it(`executes consequential writes only after ${decision === "accept" ? "explicit acceptance" : `not ${decision}`}`, async () => {
      const server = new McpServer({ name: "test", version: "1" });
      const client = new Client(
        { name: "test", version: "1" },
        { capabilities: { elicitation: { form: {} } } }
      );
      let prompts = 0;
      client.setRequestHandler(ElicitRequestSchema, async () => {
        prompts++;
        return { action: decision, content: { confirm: true } };
      });
      const registry = new AppRegistry();
      registry.register(new NotesAdapter());
      registry.register(new MailAdapter());
      const confirmation = new ConfirmationManager();
      confirmation.attachServer(server.server);
      let executions = 0;
      registerCrudTools({
        server,
        registerTool: () => {},
        appRegistry: registry,
        policy: new PolicyEngine(
          ConfigSchema.parse({ permissions: { default: "readwrite" } }),
          new Logger({ level: "error", redact: [] })
        ),
        confirmation,
        validationContext: {
          finderConfig: { allowedPaths: [] },
          safariConfig: { doJavaScript: false },
        },
        executeTemplate: async () => {
          executions++;
          return { content: [{ type: "text", text: "{}" }] };
        },
      });
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      try {
        await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
        for (const [name, args] of [
          ["app.update", { app: "notes", id: "123", properties: { body: "new" } }],
          ["app.delete", { app: "notes", id: "123" }],
          ["app.action", { app: "mail", action: "send", parameters: { messageId: "123" } }],
        ] as const) {
          const result = await client.callTool({ name, arguments: args });
          assert.equal(!!result.isError, decision !== "accept");
        }
        assert.equal(prompts, 3);
        assert.equal(executions, decision === "accept" ? 3 : 0);
      } finally {
        await client.close();
        await server.close();
      }
    });
  }
});
