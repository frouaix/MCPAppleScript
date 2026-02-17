import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { Logger } from "../../src/util/logging.js";

describe("Logger", () => {
  it("should create with default config", () => {
    const logger = new Logger();
    assert.ok(logger);
  });

  it("should redact sensitive fields", () => {
    const logger = new Logger({ level: "debug", redact: ["email", "body"] });
    const chunks: string[] = [];
    const origWrite = process.stderr.write;

    process.stderr.write = (chunk: string | Uint8Array) => {
      chunks.push(typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk));
      return true;
    };

    try {
      logger.info("test", { email: "user@example.com", name: "John", body: "secret" });
      assert.equal(chunks.length, 1);
      const entry = JSON.parse(chunks[0]!);
      assert.equal(entry.data.email, "[REDACTED]");
      assert.equal(entry.data.name, "John");
      assert.equal(entry.data.body, "[REDACTED]");
    } finally {
      process.stderr.write = origWrite;
    }
  });

  it("should filter by log level", () => {
    const logger = new Logger({ level: "warn", redact: [] });
    const chunks: string[] = [];
    const origWrite = process.stderr.write;

    process.stderr.write = (chunk: string | Uint8Array) => {
      chunks.push(typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk));
      return true;
    };

    try {
      logger.debug("should not appear");
      logger.info("should not appear");
      logger.warn("should appear");
      logger.error("should appear");
      assert.equal(chunks.length, 2);
    } finally {
      process.stderr.write = origWrite;
    }
  });

  it("should redact nested objects", () => {
    const logger = new Logger({ level: "debug", redact: ["content"] });
    const chunks: string[] = [];
    const origWrite = process.stderr.write;

    process.stderr.write = (chunk: string | Uint8Array) => {
      chunks.push(typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk));
      return true;
    };

    try {
      logger.info("test", { nested: { content: "secret", visible: "ok" } });
      const entry = JSON.parse(chunks[0]!);
      assert.equal(entry.data.nested.content, "[REDACTED]");
      assert.equal(entry.data.nested.visible, "ok");
    } finally {
      process.stderr.write = origWrite;
    }
  });
});
