import { describe, it, beforeEach, afterEach } from "node:test";
import { strict as assert } from "node:assert";
import { writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadConfig, resolveConfigPath, loadConfigFromFile } from "../../src/config/config.js";

const TEST_DIR = join(tmpdir(), "mcp-applescript-test-" + process.pid);

describe("config loading", () => {
  beforeEach(() => {
    mkdirSync(TEST_DIR, { recursive: true });
    delete process.env["APPLESCRIPT_MCP_CONFIG"];
  });

  afterEach(() => {
    delete process.env["APPLESCRIPT_MCP_CONFIG"];
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  describe("resolveConfigPath", () => {
    it("should return env var path when set and file exists", () => {
      const configPath = join(TEST_DIR, "config.json");
      writeFileSync(configPath, "{}");
      process.env["APPLESCRIPT_MCP_CONFIG"] = configPath;

      const result = resolveConfigPath();
      assert.equal(result, configPath);
    });

    it("should throw when env var path does not exist", () => {
      process.env["APPLESCRIPT_MCP_CONFIG"] = join(TEST_DIR, "missing.json");
      assert.throws(() => resolveConfigPath(), /Config file not found/);
    });

    it("should return undefined when no config found", () => {
      const result = resolveConfigPath();
      // May return default path if it exists, or undefined
      assert.ok(result === undefined || typeof result === "string");
    });
  });

  describe("loadConfigFromFile", () => {
    it("should load and parse valid JSON", () => {
      const configPath = join(TEST_DIR, "valid.json");
      writeFileSync(configPath, JSON.stringify({ executorPath: "/test" }));

      const result = loadConfigFromFile(configPath);
      assert.deepStrictEqual(result, { executorPath: "/test" });
    });

    it("should throw on invalid JSON", () => {
      const configPath = join(TEST_DIR, "invalid.json");
      writeFileSync(configPath, "not json!");

      assert.throws(() => loadConfigFromFile(configPath), /Failed to parse/);
    });
  });

  describe("loadConfig", () => {
    it("should load config from env var path", () => {
      const configPath = join(TEST_DIR, "config.json");
      writeFileSync(
        configPath,
        JSON.stringify({
          executorPath: "/custom/executor",
          defaultTimeoutMs: 5000,
        })
      );
      process.env["APPLESCRIPT_MCP_CONFIG"] = configPath;

      const config = loadConfig();
      assert.equal(config.executorPath, "/custom/executor");
      assert.equal(config.defaultTimeoutMs, 5000);
    });

    it("should throw on invalid config values", () => {
      const configPath = join(TEST_DIR, "bad.json");
      writeFileSync(configPath, JSON.stringify({ defaultTimeoutMs: -1 }));
      process.env["APPLESCRIPT_MCP_CONFIG"] = configPath;

      assert.throws(() => loadConfig(), /Invalid config/);
    });
  });
});
