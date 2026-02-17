import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { runExecutor } from "../../src/exec/executor.js";
import { ExecutorRequest } from "../../src/exec/types.js";
import { Logger } from "../../src/util/logging.js";

const silentLogger = new Logger({ level: "error", redact: [] });

function makeRequest(overrides: Partial<ExecutorRequest> = {}): ExecutorRequest {
  return {
    requestId: "test-123",
    bundleId: "com.apple.Notes",
    mode: "template",
    templateId: "notes.create_note.v1",
    parameters: {},
    timeoutMs: 5000,
    ...overrides,
  };
}

function mockExecutor(script: string) {
  return {
    executablePath: "node",
    executableArgs: ["-e", script],
    logger: silentLogger,
  };
}

describe("executor", () => {
  it("should parse a valid success response", async () => {
    const req = makeRequest();
    const result = await runExecutor(
      req,
      mockExecutor(
        `let d="";process.stdin.on("data",c=>d+=c);process.stdin.on("end",()=>{const r=JSON.parse(d);process.stdout.write(JSON.stringify({requestId:r.requestId,ok:true,result:{done:true},stdout:"",stderr:""}))})`
      )
    );
    assert.equal(result.ok, true);
    assert.equal(result.requestId, "test-123");
    if (result.ok) {
      assert.equal(result.result.done, true);
    }
  });

  it("should parse an error response", async () => {
    const req = makeRequest();
    const result = await runExecutor(
      req,
      mockExecutor(
        `process.stdout.write(JSON.stringify({requestId:"test-123",ok:false,error:{code:"SCRIPT_ERROR",message:"bad script"}}))`
      )
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.code, "SCRIPT_ERROR");
      assert.equal(result.error.message, "bad script");
    }
  });

  it("should forward request parameters via stdin", async () => {
    const req = makeRequest({ parameters: { title: "My Note" } });
    const result = await runExecutor(
      req,
      mockExecutor(
        `let d="";process.stdin.on("data",c=>d+=c);process.stdin.on("end",()=>{const r=JSON.parse(d);process.stdout.write(JSON.stringify({requestId:r.requestId,ok:true,result:{title:r.parameters.title},stdout:"",stderr:""}))})`
      )
    );
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.result.title, "My Note");
    }
  });

  it("should reject on invalid JSON output", async () => {
    const req = makeRequest();
    await assert.rejects(
      () => runExecutor(req, mockExecutor(`process.stdout.write("not json")`)),
      (err: Error) => {
        assert.ok(err.message.includes("Invalid JSON"));
        return true;
      }
    );
  });

  it("should reject on timeout", async () => {
    const req = makeRequest({ timeoutMs: 200 });
    await assert.rejects(
      () => runExecutor(req, mockExecutor(`setTimeout(()=>{},10000)`)),
      (err: Error) => {
        assert.ok(err.message.includes("timed out"));
        return true;
      }
    );
  });

  it("should reject when executable not found", async () => {
    const req = makeRequest();
    await assert.rejects(
      () =>
        runExecutor(req, {
          executablePath: "/nonexistent/binary",
          logger: silentLogger,
        }),
      (err: Error) => {
        assert.ok(err.message.includes("Failed to spawn"));
        return true;
      }
    );
  });
});
