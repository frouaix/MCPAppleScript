import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ConfigSchema, DEFAULT_CONFIG } from "../../src/config/schema.js";

describe("ConfigSchema", () => {
  it("defaults to no app access and no profiles", () => {
    assert.deepEqual(DEFAULT_CONFIG.permissions, { default: "off", apps: {} });
    assert.deepEqual(DEFAULT_CONFIG.profiles, {});
    assert.equal(DEFAULT_CONFIG.defaultTimeoutMs, 12000);
  });

  it("accepts a global default with app overrides and named profiles", () => {
    const config = ConfigSchema.parse({
      permissions: { default: "read", apps: { notes: "readwrite", mail: "off" } },
      profiles: { research: { apps: { notes: "read" } } },
    });
    assert.equal(config.permissions.apps.notes, "readwrite");
    assert.equal(config.profiles.research?.default, "off");
  });

  for (const input of [
    { permissions: { default: "write" } },
    { permissions: { apps: { Notes: "read" } } },
    { permissions: { apps: { "com.apple.Notes": "read" } } },
    { profiles: { "invalid name": {} } },
    { permissions: { defaults: "read" } },
    { defaultTimeoutMs: -1 },
    { logging: { level: "verbose" } },
    { apps: {} },
    { defaultMode: "full" },
    { modes: {} },
    { runScript: { enabled: true } },
  ]) {
    it(`rejects invalid or legacy configuration ${JSON.stringify(input)}`, () => {
      assert.equal(ConfigSchema.safeParse(input).success, false);
    });
  }
});
