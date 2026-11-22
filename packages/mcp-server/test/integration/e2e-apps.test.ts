/**
 * Explicitly opted-in real-app reads. Uses isolated configuration; never writes app data.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { AppNameSchema } from "../../src/config/schema.js";

describe("E2E app reads", { skip: process.env.CI || process.env.APPLESCRIPT_E2E !== "1" }, () => {
  let directory: string;
  let client: Client;

  before(async () => {
    directory = mkdtempSync(join(tmpdir(), "mcp-app-e2e-"));
    const configPath = join(directory, "config.json");
    writeFileSync(
      configPath,
      JSON.stringify({
        permissions: { default: "readwrite" },
        profiles: { e2e: { default: "read" } },
        finder: { allowedPaths: [homedir()] },
        logging: { level: "error" },
      })
    );
    client = new Client({ name: "app-e2e", version: "1" });
    await client.connect(
      new StdioClientTransport({
        command: process.execPath,
        args: [
          "--import",
          "tsx",
          fileURLToPath(new URL("../../src/index.ts", import.meta.url)),
          "--profile",
          "e2e",
        ],
        env: { ...process.env, APPLESCRIPT_MCP_CONFIG: configPath },
        stderr: "pipe",
      })
    );
  });

  after(async () => {
    await client?.close();
    if (directory) rmSync(directory, { recursive: true, force: true });
  });

  for (const app of AppNameSchema.options) {
    it(`${app}: reads real containers through a read-only profile`, async () => {
      const result = await client.callTool({ name: "app.list_containers", arguments: { app } });
      assert.ok(
        !result.isError,
        `${app} container read failed; check Automation consent and adapter support`
      );
      assert.ok(Array.isArray(result.content));
      const first = result.content[0];
      assert.ok(first && first.type === "text");
      assert.ok(Array.isArray(JSON.parse(first.text)), "Expected a container array, not raw text");
    });
  }

  it("denies writes even though the global ceiling allows them", async () => {
    const result = await client.callTool({
      name: "app.create",
      arguments: { app: "notes", properties: { title: "Not created" } },
    });
    assert.equal(result.isError, true);
  });
});
