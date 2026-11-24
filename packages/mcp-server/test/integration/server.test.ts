import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const serverPath = fileURLToPath(new URL("../../src/index.ts", import.meta.url));

describe("MCP stdio profile isolation", () => {
  let directory: string;
  let configPath: string;
  const clients: Client[] = [];

  async function connect(profile?: string): Promise<Client> {
    const client = new Client({ name: "profile-test", version: "1" });
    clients.push(client);
    await client.connect(
      new StdioClientTransport({
        command: process.execPath,
        args: ["--import", "tsx", serverPath, ...(profile ? ["--profile", profile] : [])],
        env: { ...process.env, APPLESCRIPT_MCP_CONFIG: configPath },
        stderr: "pipe",
      })
    );
    return client;
  }

  before(() => {
    directory = mkdtempSync(join(tmpdir(), "mcp-profile-test-"));
    configPath = join(directory, "config.json");
    writeFileSync(
      configPath,
      JSON.stringify({
        permissions: { default: "readwrite", apps: { mail: "off", contacts: "read" } },
        profiles: {
          research: { apps: { notes: "read", music: "read" } },
          private: { apps: { notes: "read", calendar: "read" } },
          remindersRead: { apps: { reminders: "read" } },
          contactsRead: { apps: { contacts: "read" } },
          photosRead: { apps: { photos: "read" } },
          disabled: {},
          organizer: { default: "readwrite" },
        },
        logging: { level: "error" },
      })
    );
  });

  it("exposes PhotoKit reads without granting writes", async () => {
    const client = await connect("photosRead");
    const { tools } = await client.listTools();
    assert.ok(tools.some((tool) => tool.name === "photos.list_recent"));
    assert.ok(!tools.some((tool) => tool.name === "app.create"));
    const result = await client.callTool({
      name: "photos.list_recent",
      arguments: { limit: 5, dryRun: true },
    });
    assert.ok(!result.isError);
    assert.match(JSON.stringify(result.content), /PhotoKit/);
    const search = await client.callTool({
      name: "app.search",
      arguments: { app: "photos", query: "fixture", offset: 2, dryRun: true },
    });
    assert.ok(!search.isError);
    assert.match(JSON.stringify(search.content), /PhotoKit/);
    const denied = await client.callTool({
      name: "app.create",
      arguments: { app: "photos", properties: { name: "fixture" }, dryRun: true },
    });
    assert.equal(denied.isError, true);
  });

  it("advertises only system tools when all apps are off", async () => {
    const client = await connect("disabled");
    assert.deepEqual((await client.listTools()).tools.map((tool) => tool.name).sort(), [
      "applescript.get_permissions",
      "applescript.ping",
    ]);
  });

  it("exposes useful Notes and Calendar reads without write tools", async () => {
    const client = await connect("private");
    const { tools } = await client.listTools();
    assert.equal(tools.length, 12);
    for (const name of ["app.create", "app.update", "app.delete", "app.action"]) {
      assert.ok(!tools.some((tool) => tool.name === name));
    }
    for (const name of [
      "notes.list_folders",
      "notes.list_notes",
      "notes.search_notes",
      "notes.get_note",
    ]) {
      assert.ok(tools.some((tool) => tool.name === name));
      assert.ok(
        !(
          await client.callTool({
            name,
            arguments: { noteId: "fake-note", query: "test", dryRun: true },
          })
        ).isError
      );
    }
    assert.match(client.getInstructions() ?? "", /calendar.list_events/);
    assert.match(client.getInstructions() ?? "", /notes.search_notes/);
  });

  after(async () => {
    await Promise.all(clients.map((client) => client.close()));
    rmSync(directory, { recursive: true, force: true });
  });

  it("advertises only authorized apps and read tools with task-oriented guidance", async () => {
    const client = await connect("research");
    assert.equal(client.getServerVersion()?.name, "mcp-applescript");
    const { tools } = await client.listTools();
    assert.deepEqual(
      tools.map((tool) => tool.name).sort(),
      [
        "app.action",
        "app.get",
        "app.list",
        "app.list_containers",
        "app.search",
        "notes.list_folders",
        "notes.list_notes",
        "notes.search_notes",
        "notes.get_note",
        "applescript.get_permissions",
        "applescript.ping",
      ].sort()
    );
    assert.match(client.getInstructions() ?? "", /notes.search_notes/);
    assert.match(client.getInstructions() ?? "", /Apple Calendar access is disabled/);
    const list = tools.find((tool) => tool.name === "app.list");
    assert.deepEqual(list?.inputSchema.properties?.app, {
      type: "string",
      enum: ["notes", "music"],
      description: "Authorized local apps: notes, music",
    });
    const ping = await client.callTool({ name: "applescript.ping", arguments: {} });
    assert.ok(!ping.isError);
  });

  it("exposes Calendar schedule tools only when Calendar is granted", async () => {
    const client = await connect("organizer");
    const { tools } = await client.listTools();
    assert.ok(tools.some((tool) => tool.name === "calendar.list_calendars"));
    const events = tools.find((tool) => tool.name === "calendar.list_events");
    assert.match(events?.description ?? "", /schedule tomorrow/);
    assert.ok(events?.inputSchema.properties?.startDate);
    assert.match(client.getInstructions() ?? "", /day:"tomorrow"/);
    for (const args of [
      { day: "tomorrow" },
      { startDate: "2026-03-08T00:00:00-08:00", endDate: "2026-03-09T00:00:00-07:00" },
    ]) {
      const result = await client.callTool({
        name: "calendar.list_events",
        arguments: { ...args, dryRun: true },
      });
      assert.ok(!result.isError);
      assert.match(JSON.stringify(result.content), /EventKit/);
    }
    for (const args of [
      {},
      { startDate: "2026-11-02T00:00:00" },
      { startDate: "2026-11-03T00:00:00Z", endDate: "2026-11-02T00:00:00Z" },
      { day: "tomorrow", startDate: "2026-11-02T00:00:00Z", endDate: "2026-11-03T00:00:00Z" },
    ]) {
      assert.equal(
        (
          await client.callTool({
            name: "calendar.list_events",
            arguments: { ...args, dryRun: true },
          })
        ).isError,
        true
      );
    }
    const research = await connect("research");
    assert.equal(
      (
        await research.callTool({
          name: "calendar.list_events",
          arguments: { day: "tomorrow", dryRun: true },
        })
      ).isError,
      true
    );
  });

  it("uses EventKit for Calendar reads and writes while enforcing profile grants", async () => {
    const organizer = await connect("organizer");
    const research = await connect("private");
    const bounds = { startDate: "2026-11-23T00:00:00-08:00", endDate: "2026-11-24T00:00:00-08:00" };
    for (const [name, args] of [
      ["app.list_containers", {}],
      ["app.list", bounds],
      ["app.search", { ...bounds, query: "meeting" }],
      ["app.get", { id: "fixture" }],
      ["app.create", { properties: { title: "fixture", ...bounds } }],
      ["app.update", { id: "fixture", properties: { title: "new" } }],
      ["app.delete", { id: "fixture" }],
      ["app.action", { action: "show" }],
    ] as const) {
      const result = await organizer.callTool({
        name,
        arguments: { app: "calendar", ...args, dryRun: true },
      });
      assert.ok(!result.isError, `${name}: ${JSON.stringify(result.content)}`);
      assert.match(JSON.stringify(result.content), /EventKit/);
    }
    for (const name of ["app.create", "app.update", "app.delete", "app.action"]) {
      const result = await research.callTool({
        name,
        arguments: {
          app: "calendar",
          id: "fixture",
          properties: { title: "fixture", ...bounds },
          action: "show",
          dryRun: true,
        },
      });
      assert.equal(result.isError, true);
    }
    for (const name of ["app.list", "app.search"]) {
      const result = await organizer.callTool({
        name,
        arguments: { app: "calendar", query: "fixture", dryRun: true },
      });
      assert.equal(result.isError, true);
    }
    for (const name of ["app.update", "app.delete"]) {
      const result = await organizer.callTool({
        name,
        arguments: { app: "calendar", id: "fixture", properties: { title: "fixture" } },
      });
      assert.equal(result.isError, true);
      assert.match(JSON.stringify(result.content), /does not support it/);
    }
  });

  it("rejects invalid Calendar writes before confirmation or dry-run plans", async () => {
    const client = await connect("organizer");
    for (const dryRun of [true, false]) {
      for (const [name, properties] of [
        ["app.create", {}],
        ["app.create", { title: "Meeting" }],
        ["app.update", {}],
      ] as const) {
        const result = await client.callTool({
          name,
          arguments: { app: "calendar", id: "fixture", properties, dryRun },
        });

        assert.equal(result.isError, true);
        assert.match(JSON.stringify(result.content), /Invalid Calendar/);
        assert.doesNotMatch(JSON.stringify(result.content), /does not support it/);
      }
    }
  });

  it("uses EventKit for Reminders while enforcing read-only profiles", async () => {
    const organizer = await connect("organizer");
    const reader = await connect("remindersRead");
    const due = await reader.callTool({
      name: "reminders.list_due",
      arguments: { day: "today", limit: 5, dryRun: true },
    });

    assert.ok(!due.isError);
    assert.match(JSON.stringify(due.content), /reminders.list_due/);
    const disabled = await connect("private");
    assert.ok(
      !(await disabled.listTools()).tools.some((tool) => tool.name === "reminders.list_due")
    );
    for (const [name, args] of [
      ["app.list_containers", {}],
      ["app.list", { containerId: "list-id" }],
      ["app.search", { query: "test", containerId: "list-id", offset: 2 }],
      ["app.get", { id: "fixture" }],
      ["app.create", { properties: { name: "fixture" } }],
      ["app.update", { id: "fixture", properties: { completed: true } }],
      ["app.delete", { id: "fixture" }],
      ["app.action", { action: "complete", parameters: { reminderId: "fixture" } }],
    ] as const) {
      const result = await organizer.callTool({
        name,
        arguments: { app: "reminders", ...args, dryRun: true },
      });
      assert.ok(!result.isError, `${name}: ${JSON.stringify(result.content)}`);
      assert.match(JSON.stringify(result.content), /EventKit/);
    }
    for (const name of ["app.create", "app.update", "app.delete", "app.action"]) {
      const result = await reader.callTool({
        name,
        arguments: {
          app: "reminders",
          id: "fixture",
          properties: { name: "fixture" },
          action: "complete",
          parameters: { reminderId: "fixture" },
          dryRun: true,
        },
      });
      assert.equal(result.isError, true);
    }
    for (const dryRun of [false, true]) {
      const result = await organizer.callTool({
        name: "app.update",
        arguments: { app: "reminders", id: "fixture", properties: { flagged: true }, dryRun },
      });
      assert.equal(result.isError, true);
      assert.match(JSON.stringify(result.content), /flagged/);
    }
  });

  it("uses the Contacts framework and enforces read-only profiles", async () => {
    const reader = await connect("contactsRead");
    const tools = await reader.listTools();
    assert.ok(tools.tools.some((tool) => tool.name === "contacts.search"));
    assert.ok(tools.tools.some((tool) => tool.name === "contacts.get"));
    const search = await reader.callTool({
      name: "contacts.search",
      arguments: { query: "Example", groupId: "group", limit: 5, offset: 2, dryRun: true },
    });
    assert.ok(!search.isError);
    assert.ok(Array.isArray(search.content));
    const first = search.content[0];
    assert.ok(first && first.type === "text");
    const plan = JSON.parse(first.text);
    assert.equal(plan.backend, "Contacts");
    assert.equal(plan.groupId, "group");
    assert.equal(plan.offset, 2);
    const details = await reader.callTool({
      name: "contacts.get",
      arguments: { contactId: "fixture", dryRun: true },
    });
    assert.ok(!details.isError);
    const denied = await reader.callTool({
      name: "app.create",
      arguments: { app: "contacts", properties: { firstName: "Example" }, dryRun: true },
    });
    assert.equal(denied.isError, true);
    const disabled = await connect("private");
    assert.ok(!(await disabled.listTools()).tools.some((tool) => tool.name === "contacts.search"));
  });

  it("forwards Calendar search offsets to EventKit", async () => {
    const client = await connect("organizer");
    for (const offset of [0, 200]) {
      const result = await client.callTool({
        name: "app.search",
        arguments: {
          app: "calendar",
          query: "Meeting",
          limit: 200,
          offset,
          dryRun: true,
          startDate: "2026-11-23T00:00:00-08:00",
          endDate: "2026-11-24T00:00:00-08:00",
        },
      });
      assert.ok(!result.isError);
      assert.ok(Array.isArray(result.content));
      const first = result.content[0];
      assert.ok(first && first.type === "text");
      const plan = JSON.parse(first.text);
      assert.equal(plan.operation, "calendar.search_events");
      assert.equal(plan.offset, offset);
      assert.equal(plan.limit, 200);
    }
    const invalid = await client.callTool({
      name: "app.search",
      arguments: {
        app: "calendar",
        query: "Meeting",
        offset: -1,
        dryRun: true,
        startDate: "2026-11-23T00:00:00-08:00",
        endDate: "2026-11-24T00:00:00-08:00",
      },
    });
    assert.equal(invalid.isError, true);
  });

  it("enforces different simultaneous grants at the tool-call boundary, including dry runs", async () => {
    const research = await connect("research");
    const organizer = await connect("organizer");
    for (const [client, expected] of [
      [research, "read"],
      [organizer, "readwrite"],
    ] as const) {
      const result = await client.callTool({ name: "applescript.get_permissions", arguments: {} });
      assert.ok(Array.isArray(result.content));
      const first = result.content[0];
      assert.ok(first && first.type === "text");
      const grants = JSON.parse(first.text);
      assert.equal(grants.permissions.notes, expected);
      assert.equal(grants.permissions.mail, "off");
      assert.equal(grants.profile, client === research ? "research" : "organizer");
    }

    for (const name of ["app.list_containers", "app.list", "app.get", "app.search"]) {
      const allowed = await research.callTool({
        name,
        arguments: { app: "notes", id: "fake-id", query: "test", dryRun: true },
      });
      assert.ok(!allowed.isError, `${name} should allow read`);
      const denied = await research.callTool({
        name,
        arguments: { app: "calendar", id: "fake-id", query: "test", dryRun: true },
      });
      assert.equal(denied.isError, true, `${name} should deny off`);
    }

    for (const name of ["app.create", "app.update", "app.delete", "app.action"]) {
      const args = {
        app: "notes",
        id: "fake-id",
        properties: { body: "test" },
        action: "show",
        dryRun: true,
      };
      assert.equal((await research.callTool({ name, arguments: args })).isError, true);
      const allowed = await organizer.callTool({ name, arguments: args });
      assert.ok(!allowed.isError, `${name} should allow readwrite in a dry run`);
      const off = await organizer.callTool({ name, arguments: { ...args, app: "mail" } });
      assert.equal(off.isError, true, `${name} must obey the global ceiling`);
    }
    assert.ok(
      !(
        await research.callTool({
          name: "app.action",
          arguments: { app: "music", action: "now_playing", dryRun: true },
        })
      ).isError
    );
    assert.equal(
      (
        await research.callTool({
          name: "app.action",
          arguments: { app: "music", action: "play", dryRun: true },
        })
      ).isError,
      true
    );
  });

  it("requires client confirmation for real destructive operations without executing them", async () => {
    const client = await connect("organizer");
    const result = await client.callTool({
      name: "app.delete",
      arguments: { app: "notes", id: "never-execute-this" },
    });
    assert.equal(result.isError, true);
    assert.ok(Array.isArray(result.content));
    assert.match(JSON.stringify(result.content), /does not support it/);
  });

  it("does not allow forbidden methods even with the maximum grant", async () => {
    const client = await connect();
    const inspection = await client.callTool({
      name: "applescript.get_permissions",
      arguments: {},
    });
    assert.ok(Array.isArray(inspection.content));
    const first = inspection.content[0];
    assert.ok(first && first.type === "text");
    const grants = JSON.parse(first.text);
    assert.equal(grants.profile, null);
    assert.equal(grants.permissions.notes, "readwrite");
    assert.equal(grants.permissions.mail, "off");
    assert.equal(grants.permissions.contacts, "read");
    assert.equal(
      (
        await client.callTool({
          name: "app.create",
          arguments: { app: "contacts", properties: { firstName: "Test" }, dryRun: true },
        })
      ).isError,
      true
    );
    for (const name of [
      "applescript.set_mode",
      "applescript.set_permissions",
      "applescript.run_template",
      "applescript.run_script",
    ]) {
      const result = await client.callTool({ name, arguments: {} });
      assert.equal(result.isError, true, `${name} must not exist`);
    }
  });

  it("preserves Finder and Safari restrictions under a readwrite profile", async () => {
    const client = await connect("organizer");
    for (const [name, args] of [
      ["app.list_containers", { app: "finder" }],
      ["app.list", { app: "finder" }],
      ["app.action", { app: "safari", action: "do_javascript", parameters: { script: "1" } }],
    ] as const) {
      const result = await client.callTool({ name, arguments: { ...args, dryRun: true } });
      assert.equal(result.isError, true);
    }
  });

  it("fails startup explicitly for unknown profiles, HTTP flags, and legacy config", () => {
    for (const args of [["--profile", "missing"], ["--http"], ["--port", "3333"]]) {
      const result = spawnSync(process.execPath, ["--import", "tsx", serverPath, ...args], {
        env: { ...process.env, APPLESCRIPT_MCP_CONFIG: configPath },
        encoding: "utf8",
        timeout: 5000,
      });
      assert.equal(result.status, 1);
      assert.match(result.stderr, /Unknown permission profile|Unknown argument/);
      assert.equal(result.stdout, "");
    }
    const legacyPath = join(directory, "legacy.json");
    writeFileSync(legacyPath, JSON.stringify({ apps: { "com.apple.Notes": { enabled: true } } }));
    const legacy = spawnSync(process.execPath, ["--import", "tsx", serverPath], {
      env: { ...process.env, APPLESCRIPT_MCP_CONFIG: legacyPath },
      encoding: "utf8",
      timeout: 5000,
    });
    assert.equal(legacy.status, 1);
    assert.match(legacy.stderr, /Legacy config keys/);
  });
});
