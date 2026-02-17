import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { ConfigSchema, DEFAULT_CONFIG } from "../../src/config/schema.js";

describe("ConfigSchema", () => {
  it("should parse a valid full config", () => {
    const input = {
      executorPath: "/usr/local/bin/applescript-executor",
      defaultTimeoutMs: 15000,
      apps: {
        "com.apple.Notes": {
          enabled: true,
          allowedTools: ["notes.create_note"],
        },
      },
      runScript: {
        enabled: false,
        allowedBundleIds: [],
      },
      logging: {
        level: "debug",
        redact: ["email", "body"],
      },
    };

    const result = ConfigSchema.safeParse(input);
    assert.ok(result.success, "Should parse valid config");
    assert.equal(result.data.executorPath, "/usr/local/bin/applescript-executor");
    assert.equal(result.data.defaultTimeoutMs, 15000);
    assert.equal(result.data.apps["com.apple.Notes"]?.enabled, true);
    assert.equal(result.data.logging.level, "debug");
  });

  it("should apply defaults for empty object", () => {
    const result = ConfigSchema.safeParse({});
    assert.ok(result.success, "Should parse empty config with defaults");
    assert.equal(result.data.executorPath, "applescript-executor");
    assert.equal(result.data.defaultTimeoutMs, 12000);
    assert.deepStrictEqual(result.data.apps, {});
    assert.equal(result.data.runScript.enabled, false);
    assert.equal(result.data.logging.level, "info");
  });

  it("should reject invalid timeout", () => {
    const result = ConfigSchema.safeParse({ defaultTimeoutMs: -1 });
    assert.ok(!result.success, "Should reject negative timeout");
  });

  it("should reject invalid log level", () => {
    const result = ConfigSchema.safeParse({ logging: { level: "verbose" } });
    assert.ok(!result.success, "Should reject invalid log level");
  });

  it("DEFAULT_CONFIG should have expected values", () => {
    assert.equal(DEFAULT_CONFIG.executorPath, "applescript-executor");
    assert.equal(DEFAULT_CONFIG.defaultTimeoutMs, 12000);
    assert.equal(DEFAULT_CONFIG.runScript.enabled, false);
    assert.equal(DEFAULT_CONFIG.logging.level, "info");
  });
});
