import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { createServer, ServerDeps } from "../../src/server.js";
import { ConfigSchema } from "../../src/config/schema.js";
import { Logger } from "../../src/util/logging.js";

const silentLogger = new Logger({ level: "error", redact: [] });

function makeDeps(): ServerDeps {
  const config = ConfigSchema.parse({
    permissions: { apps: { notes: "read" } },
  });
  return {
    config,
    logger: silentLogger,
  };
}

describe("createServer", () => {
  it("should create a server without error", () => {
    const server = createServer(makeDeps());
    assert.ok(server);
  });
});
