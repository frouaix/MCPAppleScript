import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PolicyEngine } from "../../src/policy/policy.js";
import { AppNameSchema, ConfigSchema, Permission } from "../../src/config/schema.js";
import { ConfigError, PolicyDeniedError } from "../../src/util/errors.js";
import { Logger } from "../../src/util/logging.js";

const logger = new Logger({ level: "error", redact: [] });
const tools = [
  "app.list_containers",
  "app.list",
  "app.get",
  "app.search",
  "app.create",
  "app.update",
  "app.delete",
  "app.action",
];

describe("PolicyEngine", () => {
  for (const permission of ["off", "read", "readwrite"] as const) {
    for (const app of AppNameSchema.options) {
      it(`enforces ${permission} for all ${app} operations`, () => {
        const policy = new PolicyEngine(
          ConfigSchema.parse({ permissions: { default: permission } }),
          logger
        );
        for (const toolName of tools) {
          const call = () => policy.assertAllowed({ toolName, app, action: "show" });
          if (
            permission === "readwrite" ||
            (permission === "read" && tools.indexOf(toolName) < 4)
          ) {
            assert.doesNotThrow(call);
          } else {
            assert.throws(call, PolicyDeniedError);
          }
        }
      });
    }
  }

  it("defaults to off and rejects unknown operations even with readwrite", () => {
    const denied = new PolicyEngine(ConfigSchema.parse({}), logger);
    assert.throws(
      () => denied.assertAllowed({ toolName: "app.list", app: "notes" }),
      PolicyDeniedError
    );
    const allowed = new PolicyEngine(
      ConfigSchema.parse({ permissions: { default: "readwrite" } }),
      logger
    );
    for (const toolName of ["app.unknown", "applescript.run_template", "applescript.run_script"]) {
      assert.throws(() => allowed.assertAllowed({ toolName, app: "notes" }), PolicyDeniedError);
    }
  });

  it("applies explicit app overrides to an all-app grant", () => {
    const policy = new PolicyEngine(
      ConfigSchema.parse({
        permissions: { default: "readwrite", apps: { mail: "off", notes: "read" } },
      }),
      logger
    );
    assert.equal(policy.getPermissions().mail, "off");
    assert.equal(policy.getPermissions().notes, "read");
    assert.equal(policy.getPermissions().calendar, "readwrite");
  });

  it("intersects profiles with the ceiling for every permission pair", () => {
    const permissions: Permission[] = ["off", "read", "readwrite"];
    for (const ceiling of permissions) {
      for (const requested of permissions) {
        const policy = new PolicyEngine(
          ConfigSchema.parse({
            permissions: { default: ceiling },
            profiles: { test: { default: requested } },
          }),
          logger,
          "test"
        );
        const expected =
          permissions[Math.min(permissions.indexOf(ceiling), permissions.indexOf(requested))];
        for (const app of AppNameSchema.options) {
          assert.equal(policy.getPermissions()[app], expected);
        }
      }
    }
  });

  it("keeps simultaneous profile grants separate, immutable, and independent of config changes", () => {
    const config = ConfigSchema.parse({
      permissions: { default: "readwrite", apps: { mail: "off" } },
      profiles: {
        research: { apps: { notes: "read" } },
        organizer: { default: "readwrite" },
      },
    });
    const research = new PolicyEngine(config, logger, "research");
    const organizer = new PolicyEngine(config, logger, "organizer");
    config.permissions.default = "off";
    if (config.profiles.research) config.profiles.research.apps.notes = "readwrite";
    assert.equal(research.getPermissions().notes, "read");
    assert.equal(research.getPermissions().calendar, "off");
    assert.equal(organizer.getPermissions().notes, "readwrite");
    assert.equal(organizer.getPermissions().mail, "off");
    assert.ok(Object.isFrozen(research.getPermissions()));
  });

  it("rejects unknown profiles, including prototype property names", () => {
    for (const profile of ["missing", "constructor", "toString", "__proto__"]) {
      assert.throws(() => new PolicyEngine(ConfigSchema.parse({}), logger, profile), ConfigError);
    }
  });

  it("allows only now_playing as a read-only action", () => {
    const policy = new PolicyEngine(
      ConfigSchema.parse({ permissions: { default: "read" } }),
      logger
    );
    assert.doesNotThrow(() =>
      policy.assertAllowed({
        toolName: "app.action",
        app: "music",
        action: "now_playing",
      })
    );
    for (const app of ["mail", "messages", "finder", "safari", "music"] as const) {
      for (const action of ["send", "move", "do_javascript", "play", "unknown"]) {
        assert.throws(
          () => policy.assertAllowed({ toolName: "app.action", app, action }),
          PolicyDeniedError
        );
      }
    }
  });
});
