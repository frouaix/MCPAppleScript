import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ElicitRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import {
  AppRegistry,
  NotesAdapter,
  MailAdapter,
  MessagesAdapter,
} from "../../src/adapters/index.js";
import { ConfigSchema } from "../../src/config/schema.js";
import { PolicyEngine } from "../../src/policy/policy.js";
import { Logger } from "../../src/util/logging.js";
import { ConfirmationManager } from "../../src/mode/confirmation.js";
import { registerCrudTools } from "../../src/tools/crud-tools.js";

describe("CRUD user confirmation boundary", () => {
  it("rejects invalid Notes and Messages operations before confirmation or execution", async () => {
    const server = new McpServer({ name: "test", version: "1" });
    const client = new Client(
      { name: "test", version: "1" },
      { capabilities: { elicitation: { form: {} } } }
    );
    let prompts = 0;
    let executions = 0;
    client.setRequestHandler(ElicitRequestSchema, async () => {
      prompts++;
      return { action: "accept", content: { confirm: true } };
    });
    const registry = new AppRegistry();
    registry.register(new NotesAdapter());
    registry.register(new MessagesAdapter());
    const confirmation = new ConfirmationManager();
    confirmation.attachServer(server.server);
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
      for (const dryRun of [false, true]) {
        for (const [name, args] of [
          [
            "app.update",
            { app: "notes", id: "selected", properties: { noteId: "other", body: "x" } },
          ],
          ["app.update", { app: "notes", id: "selected", properties: {} }],
          ["app.create", { app: "notes", properties: { body: 42 } }],
          [
            "app.action",
            {
              app: "messages",
              action: "send",
              parameters: { to: "test", message: "x", service: "RCS" },
            },
          ],
          ["app.list", { app: "messages" }],
        ] as const) {
          const result = await client.callTool({ name, arguments: { ...args, dryRun } });
          assert.equal(result.isError, true, `${name}, dryRun=${dryRun}`);
        }
      }
      assert.equal(prompts, 0);
      assert.equal(executions, 0);
    } finally {
      await client.close();
      await server.close();
    }
  });

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
