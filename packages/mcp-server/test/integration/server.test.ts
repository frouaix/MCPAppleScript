import { describe, it, before, after } from "node:test";
import { strict as assert } from "node:assert";
import { spawn, ChildProcess } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_PATH = resolve(__dirname, "../../src/index.ts");

function sendMessage(child: ChildProcess, message: object): void {
  child.stdin!.write(JSON.stringify(message) + "\n");
}

function readResponse(child: ChildProcess): Promise<object> {
  return new Promise((resolve, reject) => {
    let buffer = "";
    const handler = (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      for (const line of lines) {
        if (line.trim()) {
          child.stdout!.off("data", handler);
          try {
            resolve(JSON.parse(line));
          } catch (e) {
            reject(e);
          }
          return;
        }
      }
    };
    child.stdout!.on("data", handler);
    setTimeout(() => reject(new Error("Timeout waiting for MCP response")), 10000);
  });
}

describe("MCP server integration", () => {
  let child: ChildProcess;

  before(() => {
    const env = { ...process.env };
    delete env["APPLESCRIPT_MCP_CONFIG"];
    child = spawn("npx", ["tsx", SERVER_PATH], {
      stdio: ["pipe", "pipe", "pipe"],
      env,
    });
  });

  after(() => {
    child.kill("SIGTERM");
  });

  it("should respond to initialize request", async () => {
    const responsePromise = readResponse(child);
    sendMessage(child, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "integration-test", version: "0.1" },
      },
    });
    const response = (await responsePromise) as Record<string, unknown>;
    assert.equal(response["jsonrpc"], "2.0");
    assert.equal(response["id"], 1);
    const result = response["result"] as Record<string, unknown>;
    assert.ok(result);
    const serverInfo = result["serverInfo"] as Record<string, unknown>;
    assert.equal(serverInfo["name"], "mcp-applescript");
  });

  it("should list tools after initialization", async () => {
    // Send initialized notification
    sendMessage(child, {
      jsonrpc: "2.0",
      method: "notifications/initialized",
    });

    await new Promise((r) => setTimeout(r, 200));

    const responsePromise = readResponse(child);
    sendMessage(child, {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
    });
    const response = (await responsePromise) as Record<string, unknown>;
    assert.equal(response["id"], 2);
    const result = response["result"] as Record<string, unknown>;
    const tools = result["tools"] as Array<Record<string, unknown>>;
    assert.ok(tools.length >= 5, `Expected at least 5 tools, got ${tools.length}`);

    const toolNames = tools.map((t) => t["name"]);
    assert.ok(toolNames.includes("applescript.ping"));
    assert.ok(toolNames.includes("applescript.list_apps"));
    assert.ok(toolNames.includes("notes.create_note"));
    assert.ok(toolNames.includes("calendar.create_event"));
    assert.ok(toolNames.includes("mail.compose_draft"));
  });

  it("should handle ping tool call", async () => {
    const responsePromise = readResponse(child);
    sendMessage(child, {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        name: "applescript.ping",
        arguments: {},
      },
    });
    const response = (await responsePromise) as Record<string, unknown>;
    assert.equal(response["id"], 3);
    const result = response["result"] as Record<string, unknown>;
    const content = result["content"] as Array<Record<string, unknown>>;
    assert.ok(content.length > 0);
    const text = content[0]!["text"] as string;
    const parsed = JSON.parse(text);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.version, "0.1.0");
  });
});
