import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { runExecutor } from "../../src/exec/executor.js";
import { ExecutorRequest } from "../../src/exec/types.js";
import { Logger } from "../../src/util/logging.js";
import { jsonEscHandlers } from "../../src/templates/escape.js";
import { buildTemplateScript } from "../../src/templates/index.js";

const silentLogger = new Logger({ level: "error", redact: [] });

function makeRequest(overrides: Partial<ExecutorRequest> = {}): ExecutorRequest {
  return {
    requestId: "test-123",
    bundleId: "com.apple.Notes",
    mode: "template",
    templateId: "notes.list_folders",
    parameters: {},
    timeoutMs: 5000,
    ...overrides,
  };
}

const opts = { logger: silentLogger };

describe("executor", () => {
  it("should return script in dry run mode (template)", async () => {
    const req = makeRequest({ dryRun: true });
    const result = await runExecutor(req, opts);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.ok(typeof result.result.script === "string");
      assert.ok((result.result.script as string).includes("tell application"));
    }
  });

  it("should return script in dry run mode (raw)", async () => {
    const req = makeRequest({
      mode: "raw",
      script: 'return "hello"',
      dryRun: true,
    });
    const result = await runExecutor(req, opts);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.result.script, 'return "hello"');
    }
  });

  it("should throw on template mode without templateId", async () => {
    const req = makeRequest({ templateId: undefined });
    await assert.rejects(() => runExecutor(req, opts), /templateId is required/);
  });

  it("should throw on raw mode without script", async () => {
    const req = makeRequest({ mode: "raw", script: undefined });
    await assert.rejects(() => runExecutor(req, opts), /script is required/);
  });

  it("should throw on unknown template prefix", async () => {
    const req = makeRequest({ templateId: "unknown.action", dryRun: true });
    await assert.rejects(() => runExecutor(req, opts), /Unknown template prefix/);
  });

  it("should execute a simple osascript and return result", async () => {
    const req = makeRequest({
      mode: "raw",
      script: 'return "{\\"ok\\":true}"',
      timeoutMs: 5000,
    });
    const result = await runExecutor(req, opts);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.result.ok, true);
    }
  });

  it("should handle osascript errors", async () => {
    const req = makeRequest({
      mode: "raw",
      script: "this is not valid applescript at all",
      timeoutMs: 5000,
    });
    const result = await runExecutor(req, opts);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.code, "SCRIPT_ERROR");
    }
  });

  it("should handle timeout", async () => {
    const req = makeRequest({
      mode: "raw",
      script: "delay 30",
      timeoutMs: 500,
    });
    const result = await runExecutor(req, opts);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.code, "TIMEOUT");
    }
  });

  it("should handle non-JSON osascript output as text", async () => {
    const req = makeRequest({
      mode: "raw",
      script: 'return "hello world"',
      timeoutMs: 5000,
    });
    const result = await runExecutor(req, opts);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.result.text, "hello world");
    }
  });

  it("escapes JSON control characters without losing carriage returns", async () => {
    const req = makeRequest({
      mode: "raw",
      script: `set value to "quote" & quote & (character id 0) & (character id 8) & tab & return & linefeed
return "{\\"value\\":\\"" & my jsonEsc(value) & "\\"}"
${jsonEscHandlers}`,
    });
    const result = await runExecutor(req, opts);
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.result.value, 'quote"\0\b\t\r\n');
  });

  it("generates chat details without unsupported message history", () => {
    const script = buildTemplateScript("messages.get_chat", "com.apple.MobileSMS", {
      chatId: "test",
    });
    assert.doesNotMatch(script, /messages of c|messageCount/);
    assert.match(script, /participants of c/);
  });
});
