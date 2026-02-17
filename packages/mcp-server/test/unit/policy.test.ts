import { describe, it, beforeEach } from "node:test";
import { strict as assert } from "node:assert";
import { PolicyEngine } from "../../src/policy/policy.js";
import { Config, ConfigSchema } from "../../src/config/schema.js";
import { PolicyDeniedError } from "../../src/util/errors.js";
import { Logger } from "../../src/util/logging.js";

function makeConfig(overrides: Partial<Config> = {}): Config {
  return ConfigSchema.parse(overrides);
}

// Suppress log output during tests
const silentLogger = new Logger({ level: "error", redact: [] });

describe("PolicyEngine", () => {
  let policy: PolicyEngine;

  describe("tools without bundleId", () => {
    beforeEach(() => {
      policy = new PolicyEngine(makeConfig(), silentLogger);
    });

    it("should allow applescript.ping without bundleId", () => {
      assert.doesNotThrow(() => {
        policy.assertAllowed({ toolName: "applescript.ping" });
      });
    });

    it("should allow applescript.list_apps without bundleId", () => {
      assert.doesNotThrow(() => {
        policy.assertAllowed({ toolName: "applescript.list_apps" });
      });
    });
  });

  describe("app-scoped tools", () => {
    beforeEach(() => {
      policy = new PolicyEngine(
        makeConfig({
          apps: {
            "com.apple.Notes": {
              enabled: true,
              allowedTools: ["notes.create_note", "applescript.run_template"],
            },
            "com.apple.Calendar": {
              enabled: true,
              allowedTools: ["calendar.create_event"],
            },
            "com.apple.Mail": {
              enabled: false,
              allowedTools: ["mail.compose_draft"],
            },
          },
        }),
        silentLogger
      );
    });

    it("should allow configured app + tool combination", () => {
      assert.doesNotThrow(() => {
        policy.assertAllowed({
          toolName: "notes.create_note",
          bundleId: "com.apple.Notes",
        });
      });
    });

    it("should deny unconfigured app", () => {
      assert.throws(
        () => {
          policy.assertAllowed({
            toolName: "reminders.create",
            bundleId: "com.apple.reminders",
          });
        },
        (err: unknown) => {
          assert.ok(err instanceof PolicyDeniedError);
          assert.ok(err.message.includes("not configured"));
          return true;
        }
      );
    });

    it("should deny disabled app", () => {
      assert.throws(
        () => {
          policy.assertAllowed({
            toolName: "mail.compose_draft",
            bundleId: "com.apple.Mail",
          });
        },
        (err: unknown) => {
          assert.ok(err instanceof PolicyDeniedError);
          assert.ok(err.message.includes("disabled"));
          return true;
        }
      );
    });

    it("should deny tool not in app allowlist", () => {
      assert.throws(
        () => {
          policy.assertAllowed({
            toolName: "notes.delete_note",
            bundleId: "com.apple.Notes",
          });
        },
        (err: unknown) => {
          assert.ok(err instanceof PolicyDeniedError);
          assert.ok(err.message.includes("not allowed"));
          return true;
        }
      );
    });

    it("should allow any tool when allowedTools is empty", () => {
      const openPolicy = new PolicyEngine(
        makeConfig({
          apps: {
            "com.apple.Notes": { enabled: true, allowedTools: [] },
          },
        }),
        silentLogger
      );
      assert.doesNotThrow(() => {
        openPolicy.assertAllowed({
          toolName: "notes.anything",
          bundleId: "com.apple.Notes",
        });
      });
    });
  });

  describe("run_script policy", () => {
    it("should deny run_script when globally disabled", () => {
      policy = new PolicyEngine(
        makeConfig({ runScript: { enabled: false, allowedBundleIds: [] } }),
        silentLogger
      );
      assert.throws(
        () => {
          policy.assertAllowed({ toolName: "applescript.run_script" });
        },
        (err: unknown) => {
          assert.ok(err instanceof PolicyDeniedError);
          assert.ok(err.message.includes("disabled"));
          return true;
        }
      );
    });

    it("should allow run_script when globally enabled with no bundle filter", () => {
      policy = new PolicyEngine(
        makeConfig({ runScript: { enabled: true, allowedBundleIds: [] } }),
        silentLogger
      );
      assert.doesNotThrow(() => {
        policy.assertAllowed({
          toolName: "applescript.run_script",
          bundleId: "com.apple.Notes",
        });
      });
    });

    it("should allow run_script for allowlisted bundle", () => {
      policy = new PolicyEngine(
        makeConfig({
          runScript: { enabled: true, allowedBundleIds: ["com.apple.Notes"] },
        }),
        silentLogger
      );
      assert.doesNotThrow(() => {
        policy.assertAllowed({
          toolName: "applescript.run_script",
          bundleId: "com.apple.Notes",
        });
      });
    });

    it("should deny run_script for non-allowlisted bundle", () => {
      policy = new PolicyEngine(
        makeConfig({
          runScript: { enabled: true, allowedBundleIds: ["com.apple.Notes"] },
        }),
        silentLogger
      );
      assert.throws(
        () => {
          policy.assertAllowed({
            toolName: "applescript.run_script",
            bundleId: "com.apple.Calendar",
          });
        },
        (err: unknown) => {
          assert.ok(err instanceof PolicyDeniedError);
          assert.ok(err.message.includes("not allowed"));
          return true;
        }
      );
    });
  });

  describe("helper methods", () => {
    beforeEach(() => {
      policy = new PolicyEngine(
        makeConfig({
          apps: {
            "com.apple.Notes": {
              enabled: true,
              allowedTools: ["notes.create_note"],
            },
            "com.apple.Mail": {
              enabled: false,
              allowedTools: [],
            },
          },
        }),
        silentLogger
      );
    });

    it("isAppEnabled returns true for enabled app", () => {
      assert.equal(policy.isAppEnabled("com.apple.Notes"), true);
    });

    it("isAppEnabled returns false for disabled app", () => {
      assert.equal(policy.isAppEnabled("com.apple.Mail"), false);
    });

    it("isAppEnabled returns false for unconfigured app", () => {
      assert.equal(policy.isAppEnabled("com.apple.Safari"), false);
    });

    it("getAllowedTools returns tools for configured app", () => {
      assert.deepStrictEqual(policy.getAllowedTools("com.apple.Notes"), ["notes.create_note"]);
    });

    it("getAllowedTools returns empty array for unconfigured app", () => {
      assert.deepStrictEqual(policy.getAllowedTools("com.apple.Safari"), []);
    });

    it("getConfiguredApps returns all configured apps", () => {
      const apps = policy.getConfiguredApps();
      assert.equal(apps.length, 2);
      assert.ok(apps.some((a) => a.bundleId === "com.apple.Notes"));
      assert.ok(apps.some((a) => a.bundleId === "com.apple.Mail"));
    });
  });
});
