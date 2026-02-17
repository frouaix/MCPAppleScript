import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { safeJsonParse, safeJsonStringify } from "../../src/util/json.js";

describe("json utilities", () => {
  describe("safeJsonParse", () => {
    it("should parse valid JSON", () => {
      const result = safeJsonParse('{"key": "value"}');
      assert.ok(result.ok);
      assert.deepStrictEqual(result.value, { key: "value" });
    });

    it("should return error for invalid JSON", () => {
      const result = safeJsonParse("not json");
      assert.ok(!result.ok);
      assert.ok(result.error.length > 0);
    });

    it("should parse arrays", () => {
      const result = safeJsonParse("[1, 2, 3]");
      assert.ok(result.ok);
      assert.deepStrictEqual(result.value, [1, 2, 3]);
    });

    it("should parse primitives", () => {
      const result = safeJsonParse("42");
      assert.ok(result.ok);
      assert.equal(result.value, 42);
    });
  });

  describe("safeJsonStringify", () => {
    it("should stringify objects", () => {
      const result = safeJsonStringify({ a: 1 });
      assert.equal(result, '{"a":1}');
    });

    it("should pretty print when requested", () => {
      const result = safeJsonStringify({ a: 1 }, true);
      assert.ok(result.includes("\n"));
    });

    it("should handle circular references gracefully", () => {
      const obj: Record<string, unknown> = {};
      obj["self"] = obj;
      const result = safeJsonStringify(obj);
      assert.ok(result.includes("error"));
    });
  });
});
