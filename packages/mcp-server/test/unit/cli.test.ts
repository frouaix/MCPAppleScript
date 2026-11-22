import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseArgs } from "../../src/cli.js";

describe("stdio arguments", () => {
  it("supports global grants or one named profile", () => {
    assert.deepEqual(parseArgs([]), { profile: undefined, help: false });
    assert.deepEqual(parseArgs(["--profile", "research"]), { profile: "research", help: false });
    assert.equal(parseArgs(["--help"]).help, true);
  });

  for (const args of [
    ["--http"],
    ["--port", "3333"],
    ["--host", "localhost"],
    ["--profile"],
    ["--profile", "--help"],
    ["--profile", "invalid name"],
    ["--profile", "one", "--profile", "two"],
    ["research"],
    ["--unknown"],
  ]) {
    it(`rejects ${JSON.stringify(args)}`, () => {
      assert.throws(() => parseArgs(args));
    });
  }
});
