import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { ConfirmationManager } from "../../src/mode/confirmation.js";

describe("ConfirmationManager", () => {
  let cm: ConfirmationManager;

  beforeEach(() => {
    cm = new ConfirmationManager();
  });

  it("issues a token on first call (no elicitation server)", async () => {
    const result = await cm.requestConfirmation("test.action", "Test details");
    assert.equal(result.confirmed, false);
    if (!result.confirmed) {
      assert.ok(result.token.length > 0);
      assert.ok(result.message.includes("test.action"));
      assert.ok(result.message.includes(result.token));
    }
  });

  it("accepts a valid token on second call", async () => {
    const first = await cm.requestConfirmation("test.action", "Test details");
    assert.equal(first.confirmed, false);
    if (first.confirmed) return;

    const second = await cm.requestConfirmation("test.action", "Test details", first.token);
    assert.equal(second.confirmed, true);
  });

  it("rejects a consumed token (single-use)", async () => {
    const first = await cm.requestConfirmation("test.action", "details");
    if (first.confirmed) return;

    // Consume the token
    const second = await cm.requestConfirmation("test.action", "details", first.token);
    assert.equal(second.confirmed, true);

    // Same token should now fail and issue a new one
    const third = await cm.requestConfirmation("test.action", "details", first.token);
    assert.equal(third.confirmed, false);
  });

  it("rejects a token for a different action", async () => {
    const first = await cm.requestConfirmation("action.A", "details");
    if (first.confirmed) return;

    const second = await cm.requestConfirmation("action.B", "details", first.token);
    assert.equal(second.confirmed, false);
  });

  it("rejects an invalid token", async () => {
    const result = await cm.requestConfirmation("test.action", "details", "invalid-token");
    assert.equal(result.confirmed, false);
    if (!result.confirmed) {
      assert.ok(result.token.length > 0);
    }
  });
});
