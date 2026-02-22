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

/** Read messages until we get one with the expected JSON-RPC id. */
function readResponseById(child: ChildProcess, id: number): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let buffer = "";
    const handler = (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      // Process complete lines, keep last partial line in buffer
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line) as Record<string, unknown>;
          if (msg["id"] === id) {
            child.stdout!.off("data", handler);
            resolve(msg);
            return;
          }
          // Skip notifications and other messages
        } catch {
          // Skip unparseable lines
        }
      }
    };
    child.stdout!.on("data", handler);
    setTimeout(() => reject(new Error(`Timeout waiting for response id=${id}`)), 10000);
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

  it("should list only readonly tools by default", async () => {
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
    const toolNames = tools.map((t) => t["name"]);

    // Default mode is readonly — only 7 tools visible
    assert.equal(tools.length, 7, `Expected 7 tools in readonly mode, got ${tools.length}: ${toolNames.join(", ")}`);
    assert.ok(toolNames.includes("applescript.ping"));
    assert.ok(toolNames.includes("applescript.get_mode"));
    assert.ok(toolNames.includes("applescript.set_mode"));
    assert.ok(toolNames.includes("app.list_containers"));
    assert.ok(toolNames.includes("app.list"));
    assert.ok(toolNames.includes("app.get"));
    assert.ok(toolNames.includes("app.search"));
    assert.ok(!toolNames.includes("app.create"), "app.create should not be visible in readonly");
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
    assert.equal(parsed.version, "0.2.0");
  });

  it("should show all tools after switching to create mode", async () => {
    // Switch to create mode — use readResponseById to skip the toolListChanged notification
    const setModePromise = readResponseById(child, 4);
    sendMessage(child, {
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: {
        name: "applescript.set_mode",
        arguments: { mode: "create" },
      },
    });

    const setModeResult = await setModePromise;
    const result = setModeResult["result"] as Record<string, unknown>;
    const content = result["content"] as Array<Record<string, unknown>>;
    const parsed = JSON.parse(content[0]!["text"] as string);
    assert.equal(parsed.oldMode, "readonly");
    assert.equal(parsed.newMode, "create");

    // Wait for any remaining notification to flush
    await new Promise((r) => setTimeout(r, 200));

    // Now list tools — should see create-level tools
    const listPromise = readResponseById(child, 5);
    sendMessage(child, {
      jsonrpc: "2.0",
      id: 5,
      method: "tools/list",
    });
    const listResponse = await listPromise;
    const listResult = listResponse["result"] as Record<string, unknown>;
    const tools = listResult["tools"] as Array<Record<string, unknown>>;
    const toolNames = tools.map((t) => t["name"]);

    // Should now include create-level tools
    assert.ok(toolNames.includes("app.create"), "app.create should be visible in create mode");
    assert.ok(toolNames.includes("app.action"), "app.action should be visible in create mode");
    assert.ok(toolNames.includes("applescript.run_template"), "applescript.run_template should be visible in create mode");
    // But not full-mode tools
    assert.ok(!toolNames.includes("applescript.run_script"), "run_script should not be visible in create mode");
  });
});
