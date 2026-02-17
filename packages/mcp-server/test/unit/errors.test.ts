import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import {
  McpAppleScriptError,
  PolicyDeniedError,
  ExecutorError,
  ConfigError,
} from "../../src/util/errors.js";

describe("errors", () => {
  describe("McpAppleScriptError", () => {
    it("should store code and message", () => {
      const err = new McpAppleScriptError("TIMEOUT", "Operation timed out");
      assert.equal(err.code, "TIMEOUT");
      assert.equal(err.message, "Operation timed out");
      assert.equal(err.name, "McpAppleScriptError");
    });

    it("should serialize to JSON", () => {
      const err = new McpAppleScriptError("AUTOMATION_DENIED", "Denied", {
        osStatus: -1743,
      });
      const json = err.toJSON();
      assert.equal(json.code, "AUTOMATION_DENIED");
      assert.equal(json.message, "Denied");
      assert.deepStrictEqual(json.details, { osStatus: -1743 });
    });

    it("should omit details from JSON when undefined", () => {
      const err = new McpAppleScriptError("UNKNOWN_ERROR", "Something broke");
      const json = err.toJSON();
      assert.ok(!("details" in json));
    });
  });

  describe("PolicyDeniedError", () => {
    it("should have POLICY_DENIED code", () => {
      const err = new PolicyDeniedError("Not allowed");
      assert.equal(err.code, "POLICY_DENIED");
      assert.equal(err.name, "PolicyDeniedError");
      assert.ok(err instanceof McpAppleScriptError);
    });
  });

  describe("ExecutorError", () => {
    it("should extend McpAppleScriptError", () => {
      const err = new ExecutorError("SCRIPT_ERROR", "Script failed");
      assert.equal(err.code, "SCRIPT_ERROR");
      assert.ok(err instanceof McpAppleScriptError);
    });
  });

  describe("ConfigError", () => {
    it("should have CONFIG_ERROR code", () => {
      const err = new ConfigError("Bad config");
      assert.equal(err.code, "CONFIG_ERROR");
      assert.ok(err instanceof McpAppleScriptError);
    });
  });
});
