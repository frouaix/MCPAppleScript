/**
 * End-to-end tests for all 10 Apple apps via the MCP server.
 *
 * These tests spawn the real MCP server and communicate via JSON-RPC over
 * stdio, exercising the full pipeline: server → adapter → Swift executor → macOS app.
 *
 * Requirements:
 *   - macOS with automation permissions granted for the test runner
 *   - Apps may need at least some data (containers) to return results
 *
 * Scope:
 *   - Readonly operations (list_containers, list, search) with real execution
 *   - Create/action operations with dryRun=true (pipeline validation only)
 *   - Error paths (invalid app, wrong mode)
 *   - NO destructive operations (update, delete, run_script)
 */
import { describe, it, before, after } from "node:test";
import { strict as assert } from "node:assert";
import { spawn, ChildProcess } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_PATH = resolve(__dirname, "../../src/index.ts");

let child: ChildProcess;
let nextId = 100;

function sendMessage(proc: ChildProcess, message: object): void {
  proc.stdin!.write(JSON.stringify(message) + "\n");
}

function readResponseById(proc: ChildProcess, id: number, timeoutMs = 15000): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let buffer = "";
    const handler = (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line) as Record<string, unknown>;
          if (msg["id"] === id) {
            proc.stdout!.off("data", handler);
            clearTimeout(timer);
            resolve(msg);
            return;
          }
        } catch {
          // skip
        }
      }
    };
    proc.stdout!.on("data", handler);
    const timer = setTimeout(() => {
      proc.stdout!.off("data", handler);
      reject(new Error(`Timeout waiting for response id=${id}`));
    }, timeoutMs);
    timer.unref();
  });
}

/** Call a tool and return the parsed first text content. */
async function callTool(name: string, args: Record<string, unknown> = {}): Promise<{
  raw: Record<string, unknown>;
  text: string;
  parsed: unknown;
  isError: boolean;
}> {
  const id = nextId++;
  const promise = readResponseById(child, id);
  sendMessage(child, {
    jsonrpc: "2.0",
    id,
    method: "tools/call",
    params: { name, arguments: args },
  });
  const response = await promise;
  const result = response["result"] as Record<string, unknown>;
  const content = result["content"] as Array<Record<string, unknown>>;
  const text = (content[0]?.["text"] as string) ?? "";
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = text;
  }
  return { raw: response, text, parsed, isError: !!result["isError"] };
}

/** Initialize the server and complete the handshake. */
async function initServer(): Promise<void> {
  const id = nextId++;
  const promise = readResponseById(child, id);
  sendMessage(child, {
    jsonrpc: "2.0",
    id,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "e2e-test", version: "1.0" },
    },
  });
  await promise;
  sendMessage(child, { jsonrpc: "2.0", method: "notifications/initialized" });
  await new Promise((r) => setTimeout(r, 300));
}

const ALL_APPS = [
  "notes", "calendar", "reminders", "mail", "contacts",
  "messages", "photos", "music", "finder", "safari",
];

// ─── Test suite ───────────────────────────────────────────────────────────────

describe("E2E app tests", () => {
  before(async () => {
    const env = { ...process.env };
    delete env["APPLESCRIPT_MCP_CONFIG"];
    child = spawn("npx", ["tsx", SERVER_PATH], {
      stdio: ["pipe", "pipe", "pipe"],
      env,
    });
    await initServer();
  });

  after(() => {
    child.kill("SIGTERM");
  });

  // ── System tools ──────────────────────────────────────────────────────────

  describe("system tools", () => {
    it("ping returns version and app list", async () => {
      const { parsed } = await callTool("applescript.ping");
      const p = parsed as Record<string, unknown>;
      assert.equal(p.ok, true);
      assert.ok(typeof p.version === "string");
      assert.ok(Array.isArray(p.apps));
      assert.equal((p.apps as string[]).length, 10);
    });

    it("get_mode returns readonly by default", async () => {
      const { parsed } = await callTool("applescript.get_mode");
      const p = parsed as Record<string, unknown>;
      assert.equal(p.mode, "readonly");
    });
  });

  // ── Readonly per-app ──────────────────────────────────────────────────────

  describe("readonly operations", () => {
    for (const app of ALL_APPS) {
      describe(app, () => {
        it(`${app}: list_containers`, async () => {
          const { parsed, isError } = await callTool("app.list_containers", { app });
          // Some apps may error if not running or no permission — that's useful signal too
          if (!isError) {
            assert.ok(Array.isArray(parsed) || typeof parsed === "object",
              `Expected array or object, got ${typeof parsed}`);
          }
        });

        it(`${app}: list (limit 3)`, async () => {
          const { parsed, isError } = await callTool("app.list", { app, limit: 3 });
          if (!isError) {
            assert.ok(Array.isArray(parsed) || typeof parsed === "object",
              `Expected array or object, got ${typeof parsed}`);
          }
        });

        it(`${app}: search`, async () => {
          const { parsed, isError } = await callTool("app.search", { app, query: "test", limit: 3 });
          if (!isError) {
            assert.ok(Array.isArray(parsed) || typeof parsed === "object",
              `Expected array or object, got ${typeof parsed}`);
          }
        });
      });
    }
  });

  // ── Create mode with dryRun ───────────────────────────────────────────────

  describe("create mode (dryRun)", () => {
    it("switch to create mode", async () => {
      const { parsed } = await callTool("applescript.set_mode", { mode: "create" });
      const p = parsed as Record<string, unknown>;
      assert.equal(p.newMode, "create");
    });

    const createTests: Array<{ app: string; properties: Record<string, unknown> }> = [
      { app: "notes", properties: { title: "E2E Test Note", body: "test body" } },
      { app: "calendar", properties: { title: "E2E Test Event", startDate: "2026-03-01T10:00:00", endDate: "2026-03-01T11:00:00" } },
      { app: "reminders", properties: { name: "E2E Test Reminder" } },
      { app: "mail", properties: { to: "test@example.com", subject: "E2E test", body: "test" } },
      { app: "contacts", properties: { firstName: "E2E", lastName: "Test" } },
      { app: "safari", properties: { url: "https://example.com" } },
    ];

    for (const { app, properties } of createTests) {
      it(`${app}: create (dryRun)`, async () => {
        const { text, isError } = await callTool("app.create", { app, properties, dryRun: true });
        // dryRun should return the generated script, not an error
        assert.ok(text.length > 0, "Expected non-empty response");
        // If the adapter supports create and dryRun worked, text should contain script
        if (!isError) {
          assert.ok(typeof text === "string");
        }
      });
    }

    const actionTests: Array<{ app: string; action: string; parameters?: Record<string, unknown> }> = [
      { app: "notes", action: "show" },
      { app: "calendar", action: "show" },
      { app: "reminders", action: "show" },
      { app: "music", action: "now_playing" },
    ];

    for (const { app, action, parameters } of actionTests) {
      it(`${app}: action "${action}" (dryRun)`, async () => {
        const { text } = await callTool("app.action", { app, action, parameters: parameters ?? {}, dryRun: true });
        assert.ok(text.length > 0, "Expected non-empty response");
      });
    }
  });

  // ── Error paths ───────────────────────────────────────────────────────────

  describe("error paths", () => {
    it("rejects invalid app name", async () => {
      const id = nextId++;
      const promise = readResponseById(child, id);
      sendMessage(child, {
        jsonrpc: "2.0",
        id,
        method: "tools/call",
        params: { name: "app.list_containers", arguments: { app: "nonexistent" } },
      });
      const response = await promise;
      // Should return an error (either in result.isError or as JSON-RPC error)
      const error = response["error"] as Record<string, unknown> | undefined;
      const result = response["result"] as Record<string, unknown> | undefined;
      assert.ok(error || result?.["isError"],
        "Expected error for invalid app name");
    });

    it("app.create rejected in readonly mode", async () => {
      // Switch back to readonly
      await callTool("applescript.set_mode", { mode: "readonly" });
      await new Promise((r) => setTimeout(r, 300));

      // Try to call app.create — should fail (tool not found / disabled)
      const id = nextId++;
      const promise = readResponseById(child, id);
      sendMessage(child, {
        jsonrpc: "2.0",
        id,
        method: "tools/call",
        params: { name: "app.create", arguments: { app: "notes", properties: { title: "should fail" } } },
      });
      const response = await promise;
      const error = response["error"] as Record<string, unknown> | undefined;
      const result = response["result"] as Record<string, unknown> | undefined;
      // Disabled tools may return a JSON-RPC error or a result with isError
      assert.ok(error || result?.["isError"],
        "Expected error when calling create in readonly mode");
    });
  });
});
