import { describe, it, beforeEach } from "node:test";
import { strict as assert } from "node:assert";
import { createServer, ServerDeps } from "../../src/server.js";
import { ConfigSchema } from "../../src/config/schema.js";
import { PolicyEngine } from "../../src/policy/policy.js";
import { Logger } from "../../src/util/logging.js";

const silentLogger = new Logger({ level: "error", redact: [] });

function makeDeps(): ServerDeps {
  const config = ConfigSchema.parse({
    apps: {
      "com.apple.Notes": { enabled: true, allowedTools: ["notes.create_note"] },
    },
  });
  return {
    config,
    policy: new PolicyEngine(config, silentLogger),
    logger: silentLogger,
  };
}

describe("createServer", () => {
  it("should create a server without error", () => {
    const server = createServer(makeDeps());
    assert.ok(server);
  });
});
