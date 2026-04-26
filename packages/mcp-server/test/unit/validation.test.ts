import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { homedir } from "node:os";
import { FinderAdapter } from "../../src/adapters/finder.js";
import { SafariAdapter } from "../../src/adapters/safari.js";
import { ValidationContext } from "../../src/adapters/index.js";
import { NotesAdapter } from "../../src/adapters/notes.js";
import { CalendarAdapter } from "../../src/adapters/calendar.js";
import { runValidation } from "../../src/tools/crud-tools.js";

describe("FinderAdapter.validateParams", () => {
  const adapter = new FinderAdapter();

  function makeContext(allowedPaths: string[]): ValidationContext {
    return { finderConfig: { allowedPaths }, safariConfig: { doJavaScript: false } };
  }

  it("denies all when allowedPaths is empty", () => {
    const result = adapter.validateParams({ id: "/tmp/file" }, makeContext([]));
    assert.equal(result.valid, false);
    assert.ok(result.error?.includes("no paths configured"));
  });

  it("allows path within single allowed path", () => {
    const result = adapter.validateParams(
      { id: "/Users/test/Documents/file.txt" },
      makeContext(["/Users/test/Documents"])
    );
    assert.equal(result.valid, true);
    assert.equal(result.error, undefined);
  });

  it("allows path with trailing slash on allowed path", () => {
    const result = adapter.validateParams(
      { id: "/Users/test/Documents/file.txt" },
      makeContext(["/Users/test/Documents/"])
    );
    assert.equal(result.valid, true);
  });

  it("allows subpath of allowed path", () => {
    const result = adapter.validateParams(
      { id: "/Users/test/Documents/subfolder/nested.txt" },
      makeContext(["/Users/test/Documents"])
    );
    assert.equal(result.valid, true);
  });

  it("denies path outside all allowed paths", () => {
    const result = adapter.validateParams(
      { id: "/tmp/external.txt" },
      makeContext(["/Users/test/Documents"])
    );
    assert.equal(result.valid, false);
    assert.ok(result.error?.includes("not within any allowed path"));
    assert.ok(result.error?.includes("/tmp/external.txt"));
  });

  it("denies sibling path of allowed path", () => {
    const result = adapter.validateParams(
      { id: "/Users/test/Other/file.txt" },
      makeContext(["/Users/test/Documents"])
    );
    assert.equal(result.valid, false);
  });

  it("resolves ~ to home directory", () => {
    const result = adapter.validateParams(
      { id: `${homedir()}/Documents/file.txt` },
      makeContext(["~/Documents"])
    );
    assert.equal(result.valid, true);
  });

  it("denies path outside home when ~ resolves to home", () => {
    const result = adapter.validateParams(
      { id: `${homedir()}/Downloads/file.txt` },
      makeContext(["~/Documents"])
    );
    assert.equal(result.valid, false);
  });

  it("checks containerId as path for list/search", () => {
    const result = adapter.validateParams(
      { containerId: "/Users/test/Documents" },
      makeContext(["/Users/test/Documents"])
    );
    assert.equal(result.valid, true);
  });

  it("denies containerId outside allowed paths", () => {
    const result = adapter.validateParams(
      { containerId: "/tmp" },
      makeContext(["/Users/test/Documents"])
    );
    assert.equal(result.valid, false);
  });

  it("checks id as path for get/delete", () => {
    const result = adapter.validateParams(
      { id: "/Users/test/Documents/file.txt" },
      makeContext(["/Users/test/Documents"])
    );
    assert.equal(result.valid, true);
  });

  it("checks properties.parentPath for create", () => {
    const result = adapter.validateParams(
      { properties: { parentPath: "/Users/test/Documents" } },
      makeContext(["/Users/test/Documents"])
    );
    assert.equal(result.valid, true);
  });

  it("denies properties.parentPath outside allowed paths", () => {
    const result = adapter.validateParams(
      { properties: { parentPath: "/tmp" } },
      makeContext(["/Users/test/Documents"])
    );
    assert.equal(result.valid, false);
  });

  it("checks properties.destPath for update", () => {
    const result = adapter.validateParams(
      { properties: { destPath: "/Users/test/Documents/newloc" } },
      makeContext(["/Users/test/Documents"])
    );
    assert.equal(result.valid, true);
  });

  it("denies properties.destPath outside allowed paths", () => {
    const result = adapter.validateParams(
      { properties: { destPath: "/private/tmp" } },
      makeContext(["/Users/test/Documents"])
    );
    assert.equal(result.valid, false);
  });

  it("checks action parameters path field", () => {
    const result = adapter.validateParams(
      { parameters: { path: "/Users/test/Documents/file.txt" } },
      makeContext(["/Users/test/Documents"])
    );
    assert.equal(result.valid, true);
  });

  it("checks action parameters sourcePath field", () => {
    const result = adapter.validateParams(
      { parameters: { sourcePath: "/Users/test/Documents/src.txt" } },
      makeContext(["/Users/test/Documents"])
    );
    assert.equal(result.valid, true);
  });

  it("checks action parameters destPath field", () => {
    const result = adapter.validateParams(
      { parameters: { destPath: "/Users/test/Documents/dst.txt" } },
      makeContext(["/Users/test/Documents"])
    );
    assert.equal(result.valid, true);
  });

  it("denies action parameter outside allowed paths", () => {
    const result = adapter.validateParams(
      { parameters: { destPath: "/var/tmp" } },
      makeContext(["/Users/test/Documents"])
    );
    assert.equal(result.valid, false);
  });

  it("allows multiple allowed paths", () => {
    const result = adapter.validateParams(
      { id: "/Users/test/Desktop/file.txt" },
      makeContext(["/Users/test/Documents", "/Users/test/Desktop"])
    );
    assert.equal(result.valid, true);
  });

  it("denies path not in any of multiple allowed paths", () => {
    const result = adapter.validateParams(
      { id: "/Users/test/Downloads/file.txt" },
      makeContext(["/Users/test/Documents", "/Users/test/Desktop"])
    );
    assert.equal(result.valid, false);
  });

  it("handles empty id string (skips validation for missing id)", () => {
    const result = adapter.validateParams(
      { id: "" },
      makeContext(["/Users/test/Documents"])
    );
    assert.equal(result.valid, true);
  });

  it("includes allowed paths in error message", () => {
    const result = adapter.validateParams(
      { id: "/tmp/file" },
      makeContext(["/Users/test/Documents", "/Users/test/Desktop"])
    );
    assert.equal(result.valid, false);
    assert.ok(result.error?.includes("/Users/test/Documents"));
    assert.ok(result.error?.includes("/Users/test/Desktop"));
  });
});

describe("SafariAdapter.validateParams", () => {
  const adapter = new SafariAdapter();

  function makeContext(doJavaScript: boolean): ValidationContext {
    return {
      finderConfig: { allowedPaths: [] },
      safariConfig: { doJavaScript },
    };
  }

  it("denies do_javascript when disabled", () => {
    const result = adapter.validateParams(
      { action: "do_javascript", parameters: { script: "alert(1)" } },
      makeContext(false)
    );
    assert.equal(result.valid, false);
    assert.ok(result.error?.includes("disabled"));
  });

  it("allows do_javascript when enabled", () => {
    const result = adapter.validateParams(
      { action: "do_javascript", parameters: { script: "alert(1)" } },
      makeContext(true)
    );
    assert.equal(result.valid, true);
    assert.equal(result.error, undefined);
  });

  it("allows other actions regardless of doJavaScript setting", () => {
    const result = adapter.validateParams(
      { action: "show", parameters: {} },
      makeContext(false)
    );
    assert.equal(result.valid, true);
  });

  it("allows add_reading_list regardless of doJavaScript setting", () => {
    const result = adapter.validateParams(
      { action: "add_reading_list", parameters: { url: "https://x.com" } },
      makeContext(false)
    );
    assert.equal(result.valid, true);
  });
});

describe("Adapters without validation", () => {
  it("NotesAdapter has empty requiredValidation and no validateParams", () => {
    const adapter = new NotesAdapter();
    assert.deepEqual(adapter.info.requiredValidation, []);
    assert.equal(adapter.validateParams, undefined);
  });

  it("CalendarAdapter has empty requiredValidation and no validateParams", () => {
    const adapter = new CalendarAdapter();
    assert.deepEqual(adapter.info.requiredValidation, []);
    assert.equal(adapter.validateParams, undefined);
  });

  it("FinderAdapter has requiredValidation", () => {
    const adapter = new FinderAdapter();
    assert.ok(adapter.info.requiredValidation);
    assert.ok(adapter.info.requiredValidation.length > 0);
    assert.ok(adapter.validateParams);
  });

  it("SafariAdapter has requiredValidation", () => {
    const adapter = new SafariAdapter();
    assert.ok(adapter.info.requiredValidation);
    assert.ok(adapter.info.requiredValidation.length > 0);
    assert.ok(adapter.validateParams);
  });
});

describe("runValidation helper", () => {
  function makeContext(allowedPaths: string[], doJavaScript: boolean): ValidationContext {
    return {
      finderConfig: { allowedPaths },
      safariConfig: { doJavaScript },
    };
  }

  it("returns null when adapter has no requiredValidation", () => {
    const notes = new NotesAdapter();
    const result = runValidation(notes, { app: "notes", id: "x" }, makeContext([], false));
    assert.equal(result, null);
  });

  it("returns null when adapter has no validateParams", () => {
    const calendar = new CalendarAdapter();
    const result = runValidation(calendar, { app: "calendar" }, makeContext([], false));
    assert.equal(result, null);
  });

  it("returns error when Finder validation fails", () => {
    const finder = new FinderAdapter();
    const result = runValidation(
      finder,
      { id: "/tmp/file" },
      makeContext(["/Users/test/Documents"], false)
    );
    assert.ok(result);
    assert.equal(result.isError, true);
    assert.ok(result.content[0].text.includes("not within any allowed path"));
  });

  it("returns null when Finder validation passes", () => {
    const finder = new FinderAdapter();
    const result = runValidation(
      finder,
      { id: "/Users/test/Documents/file.txt" },
      makeContext(["/Users/test/Documents"], false)
    );
    assert.equal(result, null);
  });

  it("returns error when Safari do_javascript is disabled", () => {
    const safari = new SafariAdapter();
    const result = runValidation(
      safari,
      { action: "do_javascript", parameters: { script: "x" } },
      makeContext([], false)
    );
    assert.ok(result);
    assert.equal(result.isError, true);
    assert.ok(result.content[0].text.includes("disabled"));
  });

  it("returns null when Safari do_javascript is enabled", () => {
    const safari = new SafariAdapter();
    const result = runValidation(
      safari,
      { action: "do_javascript", parameters: { script: "x" } },
      makeContext([], true)
    );
    assert.equal(result, null);
  });

  it("returns null for non-do_javascript Safari actions", () => {
    const safari = new SafariAdapter();
    const result = runValidation(
      safari,
      { action: "show", parameters: {} },
      makeContext([], false)
    );
    assert.equal(result, null);
  });
});
