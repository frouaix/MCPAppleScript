import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { ConfirmationManager } from "../../src/mode/confirmation.js";

describe("ConfirmationManager", () => {
  it("fails closed without an elicitation-capable client and never issues tokens", async () => {
    const manager = new ConfirmationManager();
    const result = await manager.requestConfirmation("app.delete", "Delete note");
    assert.equal(result.confirmed, false);
    assert.match(result.message, /not executed/);
    assert.equal("token" in result, false);
  });

  for (const action of ["accept", "decline", "cancel"] as const) {
    for (const confirm of [true, false]) {
      it(`handles ${action} with confirm=${confirm} without a fallback`, async () => {
        const server = new Server({ name: "test", version: "1" });
        mock.method(server, "getClientCapabilities", () => ({ elicitation: { form: {} } }));
        const elicit = mock.method(server, "elicitInput", async () => ({
          action,
          content: { confirm },
        }));
        const manager = new ConfirmationManager();
        manager.attachServer(server);
        const result = await manager.requestConfirmation("app.update", '{"id":"123","body":"new"}');
        assert.equal(result.confirmed, action === "accept" && confirm);
        assert.equal(elicit.mock.callCount(), 1);
        assert.match(elicit.mock.calls[0]?.arguments[0]?.message ?? "", /"body":"new"/);
      });
    }
  }

  it("does not turn elicitation failures into authorization", async () => {
    const server = new Server({ name: "test", version: "1" });
    mock.method(server, "getClientCapabilities", () => ({ elicitation: { form: {} } }));
    mock.method(server, "elicitInput", async () => {
      throw new Error("Client disconnected");
    });
    const manager = new ConfirmationManager();
    manager.attachServer(server);
    await assert.rejects(
      manager.requestConfirmation("app.delete", "Delete"),
      /Client disconnected/
    );
  });
});
