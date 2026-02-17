import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ModeManager,
  DEFAULT_TOOL_MODE_MAP,
  ALL_MODES,
  buildToolModeMap,
} from "../../src/mode/mode.js";

describe("ModeManager", () => {
  it("defaults to readonly", () => {
    const mm = new ModeManager();
    assert.equal(mm.getMode(), "readonly");
  });

  it("accepts a custom default mode", () => {
    const mm = new ModeManager("create");
    assert.equal(mm.getMode(), "create");
  });

  it("setMode changes mode and returns old/new", () => {
    const mm = new ModeManager("readonly");
    const result = mm.setMode("full");
    assert.equal(result.oldMode, "readonly");
    assert.equal(result.newMode, "full");
    assert.equal(mm.getMode(), "full");
  });

  it("fires change listener on mode change", () => {
    const mm = new ModeManager("readonly");
    const changes: Array<{ old: string; new: string }> = [];
    mm.onModeChange((oldMode, newMode) => changes.push({ old: oldMode, new: newMode }));

    mm.setMode("create");
    mm.setMode("full");

    assert.equal(changes.length, 2);
    assert.deepEqual(changes[0], { old: "readonly", new: "create" });
    assert.deepEqual(changes[1], { old: "create", new: "full" });
  });

  it("does not fire listener when mode unchanged", () => {
    const mm = new ModeManager("readonly");
    let fired = false;
    mm.onModeChange(() => { fired = true; });

    mm.setMode("readonly");
    assert.equal(fired, false);
  });

  it("getEnabledTools returns correct tools per mode", () => {
    const mm = new ModeManager("readonly");
    const readonlyTools = mm.getEnabledTools();
    assert.ok(readonlyTools.includes("applescript.ping"));
    assert.ok(readonlyTools.includes("applescript.get_mode"));
    assert.ok(readonlyTools.includes("applescript.set_mode"));
    assert.ok(!readonlyTools.includes("notes.create_note"));
    assert.ok(!readonlyTools.includes("applescript.run_script"));

    mm.setMode("create");
    const createTools = mm.getEnabledTools();
    assert.ok(createTools.includes("applescript.ping"));
    assert.ok(createTools.includes("notes.create_note"));
    assert.ok(createTools.includes("calendar.create_event"));
    assert.ok(!createTools.includes("applescript.run_script"));

    mm.setMode("full");
    const fullTools = mm.getEnabledTools();
    assert.ok(fullTools.includes("applescript.run_script"));
    assert.ok(fullTools.includes("notes.create_note"));
  });

  it("getDisabledTools is complement of enabled", () => {
    const mm = new ModeManager("readonly");
    const enabled = new Set(mm.getEnabledTools());
    const disabled = new Set(mm.getDisabledTools());
    const all = new Set(Object.keys(DEFAULT_TOOL_MODE_MAP));

    for (const tool of all) {
      assert.ok(enabled.has(tool) !== disabled.has(tool), `${tool} should be in exactly one set`);
    }
  });
});

describe("ModeManager.isToolAllowedInMode", () => {
  const mm = new ModeManager();

  it("ping is allowed in all modes", () => {
    for (const mode of ALL_MODES) {
      assert.ok(mm.isToolAllowedInMode("applescript.ping", mode));
    }
  });

  it("notes.create_note needs create mode", () => {
    assert.equal(mm.isToolAllowedInMode("notes.create_note", "readonly"), false);
    assert.equal(mm.isToolAllowedInMode("notes.create_note", "create"), true);
    assert.equal(mm.isToolAllowedInMode("notes.create_note", "full"), true);
  });

  it("run_script needs full mode", () => {
    assert.equal(mm.isToolAllowedInMode("applescript.run_script", "readonly"), false);
    assert.equal(mm.isToolAllowedInMode("applescript.run_script", "create"), false);
    assert.equal(mm.isToolAllowedInMode("applescript.run_script", "full"), true);
  });

  it("unknown tool is never allowed", () => {
    assert.equal(mm.isToolAllowedInMode("unknown.tool", "full"), false);
  });
});

describe("ModeManager.isDestructiveTool", () => {
  const mm = new ModeManager();

  it("marks run_script as destructive", () => {
    assert.equal(mm.isDestructiveTool("applescript.run_script"), true);
  });

  it("marks run_template as destructive", () => {
    assert.equal(mm.isDestructiveTool("applescript.run_template"), true);
  });

  it("marks notes.create_note as non-destructive", () => {
    assert.equal(mm.isDestructiveTool("notes.create_note"), false);
  });

  it("marks ping as non-destructive", () => {
    assert.equal(mm.isDestructiveTool("applescript.ping"), false);
  });
});

describe("buildToolModeMap", () => {
  it("builds map from config modes", () => {
    const map = buildToolModeMap({
      readonly: ["tool.a"],
      create: ["tool.b"],
      full: ["tool.c"],
    });
    assert.equal(map["tool.a"].minMode, "readonly");
    assert.equal(map["tool.b"].minMode, "create");
    assert.equal(map["tool.c"].minMode, "full");
  });

  it("marks destructive tools correctly", () => {
    const map = buildToolModeMap({
      readonly: ["applescript.ping"],
      create: ["applescript.run_template"],
      full: ["applescript.run_script"],
    });
    assert.equal(map["applescript.ping"].destructive, false);
    assert.equal(map["applescript.run_template"].destructive, true);
    assert.equal(map["applescript.run_script"].destructive, true);
  });

  it("custom config can promote a tool to a lower mode", () => {
    const map = buildToolModeMap({
      readonly: ["applescript.ping", "notes.create_note"],
      create: [],
      full: ["applescript.run_script"],
    });
    const mm = new ModeManager("readonly", map);
    assert.ok(mm.isToolAllowedInMode("notes.create_note", "readonly"));
  });

  it("custom config can restrict a tool to a higher mode", () => {
    const map = buildToolModeMap({
      readonly: ["applescript.ping"],
      create: [],
      full: ["notes.create_note", "applescript.run_script"],
    });
    const mm = new ModeManager("create", map);
    assert.equal(mm.isToolAllowedInMode("notes.create_note", "create"), false);
    assert.equal(mm.isToolAllowedInMode("notes.create_note", "full"), true);
  });
});
