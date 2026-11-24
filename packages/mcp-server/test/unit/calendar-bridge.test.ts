import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { runExecutor } from "../../src/exec/executor.js";
import { Logger } from "../../src/util/logging.js";
import { buildTemplateScript } from "../../src/templates/index.js";
import { CalendarAdapter } from "../../src/adapters/calendar.js";

const logger = new Logger({ level: "error", redact: [] });
const helper = fileURLToPath(
  new URL("../../dist/CalendarBridge.app/Contents/MacOS/CalendarBridge", import.meta.url)
);

describe("EventKit dispatch", () => {
  for (const operation of [
    "list_lists",
    "list_reminders",
    "list_due",
    "get_reminder",
    "search_reminders",
    "create_reminder",
    "update_reminder",
    "delete_reminder",
    "complete",
    "show",
  ]) {
    it(`plans reminders.${operation} without accessing Reminders`, async () => {
      const response = await runExecutor(
        {
          requestId: "test",
          bundleId: "com.apple.reminders",
          mode: "template",
          templateId: `reminders.${operation}`,
          parameters: {},
          timeoutMs: 10000,
          dryRun: true,
        },
        { logger }
      );
      assert.ok(response.ok);
      assert.equal(response.result.backend, "EventKit");
      assert.equal(response.result.operation, `reminders.${operation}`);
    });
  }

  for (const operation of [
    "list_calendars",
    "list_events",
    "get_event",
    "search_events",
    "create_event",
    "update_event",
    "delete_event",
    "show",
  ]) {
    it(`plans ${operation} without accessing Calendar`, async () => {
      const response = await runExecutor(
        {
          requestId: "test",
          bundleId: "com.apple.iCal",
          mode: "template",
          templateId: `calendar.${operation}`,
          parameters: { eventId: "fixture" },
          timeoutMs: 10000,
          dryRun: true,
        },
        { logger }
      );
      assert.ok(response.ok);
      assert.equal(response.result.backend, "EventKit");
      assert.equal(response.result.operation, `calendar.${operation}`);
    });
  }

  it("rejects event ID overrides in update properties", () => {
    const adapter = new CalendarAdapter();
    assert.throws(() => adapter.update({ id: "confirmed", properties: { eventId: "other" } }));
    assert.equal(adapter.info.propertiesSchema?.safeParse({ eventId: "other" }).success, false);
  });

  it("rejects invalid create fields and empty updates before execution", () => {
    const adapter = new CalendarAdapter();
    for (const properties of [
      {},
      { title: "Meeting" },
      { title: "", startDate: "2026-01-01T10:00:00Z", endDate: "2026-01-01T11:00:00Z" },
      { title: "Meeting", startDate: "2026-01-01", endDate: "2026-01-02" },
      { title: "Meeting", startDate: "2026-01-01T11:00:00Z", endDate: "2026-01-01T10:00:00Z" },
    ]) {
      assert.throws(() => adapter.create({ properties }));
    }
    assert.throws(() => adapter.update({ id: "fixture", properties: {} }));
    assert.throws(() => adapter.update({ id: "fixture", properties: { title: undefined } }));
    assert.throws(() =>
      adapter.update({
        id: "fixture",
        properties: {
          startDate: "2026-01-01T11:00:00Z",
          endDate: "2026-01-01T10:00:00Z",
        },
      })
    );
    assert.equal(
      adapter.update({ id: "fixture", properties: { allDay: false } }).parameters.allDay,
      false
    );
  });

  it("keeps Notes folder and body search", () => {
    const script = buildTemplateScript("notes.search_notes", "com.apple.Notes", {
      folderId: 'folder"123',
      query: 'meeting"notes',
    });
    assert.match(script, /notes of folder id "folder\\"123" whose name contains/);
    assert.match(script, /or plaintext contains "meeting\\"notes"/);
  });

  it(
    "rejects malformed event IDs before requesting Calendar access",
    {
      skip: process.platform !== "darwin" || !existsSync(helper),
    },
    async () => {
      const response = await runExecutor(
        {
          requestId: "test",
          bundleId: "com.apple.iCal",
          mode: "template",
          templateId: "calendar.get_event",
          parameters: { eventId: "invalid" },
          timeoutMs: 10000,
        },
        { logger }
      );
      assert.equal(response.ok, false);
      if (!response.ok) assert.match(response.error.message, /Invalid Calendar event ID/);
    }
  );

  it(
    "preserves occurrence IDs and formats local times across daylight saving",
    {
      skip: process.platform !== "darwin",
    },
    () => {
      const directory = mkdtempSync(join(tmpdir(), "calendar-native-test-"));
      try {
        const binary = join(directory, "test");
        execFileSync(
          "swiftc",
          [
            "-parse-as-library",
            "-D",
            "CALENDAR_BRIDGE_TEST",
            fileURLToPath(new URL("../../native/CalendarBridge/main.swift", import.meta.url)),
            fileURLToPath(new URL("../../native/CalendarBridge/Reminders.swift", import.meta.url)),
            fileURLToPath(new URL("../native/CalendarBridgeTests.swift", import.meta.url)),
            "-o",
            binary,
          ],
          { timeout: 60000 }
        );
        execFileSync(binary, [], {
          timeout: 10000,
          env: { ...process.env, TZ: "America/Los_Angeles" },
        });
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    }
  );
});
