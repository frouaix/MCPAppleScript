import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import {
  AppRegistry,
  CalendarAdapter,
  NotesAdapter,
  RemindersAdapter,
  ContactsAdapter,
  PhotosAdapter,
} from "../../src/adapters/index.js";
import { ConfigSchema } from "../../src/config/schema.js";
import { PolicyEngine } from "../../src/policy/policy.js";
import { Logger } from "../../src/util/logging.js";
import { ConfirmationManager } from "../../src/mode/confirmation.js";
import { registerAppReadTools, resolveEventRange } from "../../src/tools/app-read-tools.js";

describe("Calendar time ranges", () => {
  it("converts explicit offset bounds to UTC", () => {
    const range = resolveEventRange({
      startDate: "2026-03-08T00:00:00-08:00",
      endDate: "2026-03-09T00:00:00-07:00",
    });
    assert.equal(range.startDate, "2026-03-08T08:00:00Z");
    assert.equal(range.endDate, "2026-03-09T07:00:00Z");
    assert.equal((Date.parse(range.endDate) - Date.parse(range.startDate)) / 3600000, 23);
  });

  it("resolves tomorrow at local midnight instead of the next 24 hours", () => {
    const now = new Date(2026, 10, 1, 19, 46, 0);
    const result = resolveEventRange({ day: "tomorrow" }, now);
    assert.equal(Date.parse(result.startDate), new Date(2026, 10, 2).getTime());
    assert.equal(Date.parse(result.endDate), new Date(2026, 10, 3).getTime());
    assert.ok(result.timeZone);
  });

  it("resolves today and month/year rollover", () => {
    const now = new Date(2026, 11, 31, 23, 59);
    assert.equal(
      Date.parse(resolveEventRange({ day: "today" }, now).startDate),
      new Date(2026, 11, 31).getTime()
    );
    assert.equal(
      Date.parse(resolveEventRange({ day: "tomorrow" }, now).startDate),
      new Date(2027, 0, 1).getTime()
    );
  });

  it("uses 23-hour and 25-hour local days across DST transitions", () => {
    const moduleUrl = new URL("../../src/tools/app-read-tools.ts", import.meta.url).href;
    const output = execFileSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "--input-type=module",
        "-e",
        `import { resolveEventRange } from ${JSON.stringify(moduleUrl)};
      const ranges = [new Date(2026, 2, 8, 12), new Date(2026, 10, 1, 12)].map(now => {
        const range = resolveEventRange({day:"today"}, now);
        return {...range, hours:(Date.parse(range.endDate)-Date.parse(range.startDate))/3600000};
      });
      console.log(JSON.stringify(ranges));`,
      ],
      { env: { ...process.env, TZ: "America/Los_Angeles" }, encoding: "utf8", timeout: 10000 }
    );
    const ranges = JSON.parse(output);
    assert.deepEqual(
      ranges.map((range: { hours: number }) => range.hours),
      [23, 25]
    );
    assert.equal(ranges[0].startDate, "2026-03-08T08:00:00Z");
    assert.equal(ranges[0].endDate, "2026-03-09T07:00:00Z");
    assert.equal(ranges[1].timeZone, "America/Los_Angeles");
  });

  for (const input of [
    {},
    { startDate: "2026-01-01T00:00:00Z" },
    { startDate: "invalid", endDate: "invalid" },
    { startDate: "2026-01-01T00:00:00Z", endDate: "2026-01-01T00:00:00Z" },
    { startDate: "2026-01-01T00:00:00Z", endDate: "2030-01-01T00:00:00Z" },
    { day: "today" as const, endDate: "2026-01-01T00:00:00Z" },
  ]) {
    it(`rejects invalid range ${JSON.stringify(input)}`, () => {
      assert.throws(() => resolveEventRange(input));
    });
  }
});

describe("App-specific read dispatch", () => {
  it("maps discoverable tools through adapters and preserves server authorization", async () => {
    const server = new McpServer({ name: "test", version: "1" });
    const client = new Client({ name: "test", version: "1" });
    const appRegistry = new AppRegistry();
    appRegistry.register(new NotesAdapter());
    appRegistry.register(new CalendarAdapter());
    appRegistry.register(new RemindersAdapter());
    appRegistry.register(new ContactsAdapter());
    appRegistry.register(new PhotosAdapter());
    const calls: Array<{
      templateId: string;
      bundleId: string;
      parameters: Record<string, unknown>;
    }> = [];
    registerAppReadTools({
      server,
      registerTool: () => {},
      appRegistry,
      policy: new PolicyEngine(
        ConfigSchema.parse({
          permissions: {
            apps: {
              notes: "read",
              calendar: "read",
              reminders: "read",
              contacts: "read",
              photos: "read",
            },
          },
        }),
        new Logger({ level: "error", redact: [] })
      ),
      confirmation: new ConfirmationManager(),
      validationContext: {
        finderConfig: { allowedPaths: [] },
        safariConfig: { doJavaScript: false },
      },
      executeTemplate: async (templateId, bundleId, parameters) => {
        calls.push({ templateId, bundleId, parameters });
        return { content: [{ type: "text", text: "{}" }] };
      },
    });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    try {
      await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
      for (const [name, args, templateId] of [
        ["notes.list_folders", {}, "notes.list_folders"],
        ["notes.list_notes", { folderId: "folder", offset: 2, limit: 3 }, "notes.list_notes"],
        ["notes.search_notes", { folderId: "folder", query: "meeting" }, "notes.search_notes"],
        ["notes.get_note", { noteId: "note" }, "notes.get_note"],
        ["calendar.list_calendars", {}, "calendar.list_calendars"],
        [
          "calendar.list_events",
          {
            startDate: "2026-11-02T00:00:00-08:00",
            endDate: "2026-11-03T00:00:00-08:00",
            calendarId: "cal",
            limit: 2,
            offset: 3,
          },
          "calendar.list_events",
        ],
      ] as const) {
        const result = await client.callTool({ name, arguments: args });
        assert.ok(!result.isError);
        assert.equal(calls.at(-1)?.templateId, templateId);
      }
      assert.deepEqual(calls[1]?.parameters, { folderId: "folder", limit: 3, offset: 2 });
      assert.equal(calls[2]?.parameters.folderId, "folder");
      assert.equal(calls.at(-1)?.bundleId, "com.apple.iCal");
      assert.equal(calls.at(-1)?.parameters.calendarId, "cal");
      assert.equal(calls.at(-1)?.parameters.startDate, "2026-11-02T08:00:00Z");
      assert.equal(calls.at(-1)?.parameters.offset, 3);
      const due = await client.callTool({
        name: "reminders.list_due",
        arguments: { day: "today", listId: "list", limit: 5, offset: 2 },
      });
      assert.ok(!due.isError);
      assert.equal(calls.at(-1)?.templateId, "reminders.list_due");
      assert.equal(calls.at(-1)?.bundleId, "com.apple.reminders");
      assert.equal(calls.at(-1)?.parameters.listId, "list");
      assert.equal(calls.at(-1)?.parameters.limit, 5);
      assert.equal(calls.at(-1)?.parameters.offset, 2);
      assert.equal(
        calls.at(-1)?.parameters.startDate,
        resolveEventRange({ day: "today" }).startDate
      );
      const search = await client.callTool({
        name: "contacts.search",
        arguments: { query: "Example", groupId: "group", limit: 5, offset: 2 },
      });
      assert.ok(!search.isError);
      assert.equal(calls.at(-1)?.templateId, "contacts.search_people");
      assert.equal(calls.at(-1)?.parameters.groupId, "group");
      assert.equal(calls.at(-1)?.parameters.offset, 2);
      const contact = await client.callTool({
        name: "contacts.get",
        arguments: { contactId: "fixture" },
      });
      assert.ok(!contact.isError);
      assert.equal(calls.at(-1)?.templateId, "contacts.get_person");
      assert.equal(calls.at(-1)?.parameters.personId, "fixture");
      const photos = await client.callTool({
        name: "photos.list_recent",
        arguments: { albumId: "album", limit: 5, offset: 2 },
      });
      assert.ok(!photos.isError);
      assert.equal(calls.at(-1)?.templateId, "photos.list_items");
      assert.deepEqual(calls.at(-1)?.parameters, { albumId: "album", limit: 5, offset: 2 });
    } finally {
      await client.close();
      await server.close();
    }
  });
});
