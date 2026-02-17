import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { NotesAdapter } from "../../src/adapters/notes.js";
import { CalendarAdapter } from "../../src/adapters/calendar.js";
import { RemindersAdapter } from "../../src/adapters/reminders.js";
import { MailAdapter } from "../../src/adapters/mail.js";
import { ContactsAdapter } from "../../src/adapters/contacts.js";
import { MessagesAdapter } from "../../src/adapters/messages.js";
import { AppRegistry, UnsupportedOperationError } from "../../src/adapters/index.js";

describe("NotesAdapter", () => {
  const adapter = new NotesAdapter();

  it("has correct info", () => {
    assert.equal(adapter.info.name, "notes");
    assert.equal(adapter.info.bundleId, "com.apple.Notes");
    assert.equal(adapter.info.itemType, "note");
    assert.equal(adapter.info.containerType, "folder");
  });

  it("listContainers returns correct template", () => {
    const result = adapter.listContainers();
    assert.equal(result.templateId, "notes.list_folders");
  });

  it("list returns correct template with defaults", () => {
    const result = adapter.list({});
    assert.equal(result.templateId, "notes.list_notes");
    assert.equal(result.parameters.limit, 50);
    assert.equal(result.parameters.offset, 0);
  });

  it("get returns correct template", () => {
    const result = adapter.get("note-123");
    assert.equal(result.templateId, "notes.get_note");
    assert.equal(result.parameters.noteId, "note-123");
  });

  it("search returns correct template", () => {
    const result = adapter.search({ query: "test" });
    assert.equal(result.templateId, "notes.search_notes");
    assert.equal(result.parameters.query, "test");
  });

  it("create returns correct template", () => {
    const result = adapter.create({ properties: { title: "Hello", body: "World" } });
    assert.equal(result.templateId, "notes.create_note");
    assert.equal(result.parameters.title, "Hello");
    assert.equal(result.parameters.body, "World");
  });

  it("update returns correct template", () => {
    const result = adapter.update({ id: "note-123", properties: { name: "New Name" } });
    assert.equal(result.templateId, "notes.update_note");
    assert.equal(result.parameters.noteId, "note-123");
    assert.equal(result.parameters.name, "New Name");
  });

  it("delete returns correct template", () => {
    const result = adapter.delete("note-123");
    assert.equal(result.templateId, "notes.delete_note");
    assert.equal(result.parameters.noteId, "note-123");
  });

  it("action show works", () => {
    const result = adapter.action({ action: "show", parameters: { noteId: "x" } });
    assert.equal(result.templateId, "notes.show");
  });

  it("action throws for unsupported", () => {
    assert.throws(
      () => adapter.action({ action: "play", parameters: {} }),
      UnsupportedOperationError
    );
  });
});

describe("CalendarAdapter", () => {
  const adapter = new CalendarAdapter();

  it("has correct info", () => {
    assert.equal(adapter.info.name, "calendar");
    assert.equal(adapter.info.bundleId, "com.apple.iCal");
    assert.equal(adapter.info.itemType, "event");
  });

  it("listContainers returns calendars template", () => {
    assert.equal(adapter.listContainers().templateId, "calendar.list_calendars");
  });

  it("create passes properties correctly", () => {
    const result = adapter.create({
      containerId: "Work",
      properties: { title: "Meeting", startDate: "2025-01-01", endDate: "2025-01-01" },
    });
    assert.equal(result.templateId, "calendar.create_event");
    assert.equal(result.parameters.calendarName, "Work");
    assert.equal(result.parameters.title, "Meeting");
  });

  it("search passes query", () => {
    const result = adapter.search({ query: "meeting" });
    assert.equal(result.templateId, "calendar.search_events");
    assert.equal(result.parameters.query, "meeting");
  });
});

describe("RemindersAdapter", () => {
  const adapter = new RemindersAdapter();

  it("has correct info", () => {
    assert.equal(adapter.info.name, "reminders");
    assert.equal(adapter.info.bundleId, "com.apple.reminders");
    assert.equal(adapter.info.itemType, "reminder");
  });

  it("listContainers returns lists template", () => {
    assert.equal(adapter.listContainers().templateId, "reminders.list_lists");
  });

  it("create passes properties correctly", () => {
    const result = adapter.create({
      containerId: "Shopping",
      properties: { name: "Buy milk", priority: 5 },
    });
    assert.equal(result.templateId, "reminders.create_reminder");
    assert.equal(result.parameters.listName, "Shopping");
    assert.equal(result.parameters.name, "Buy milk");
    assert.equal(result.parameters.priority, 5);
  });

  it("action complete works", () => {
    const result = adapter.action({ action: "complete", parameters: { reminderId: "x" } });
    assert.equal(result.templateId, "reminders.complete");
  });

  it("action throws for unsupported", () => {
    assert.throws(
      () => adapter.action({ action: "play", parameters: {} }),
      UnsupportedOperationError
    );
  });
});

describe("MailAdapter", () => {
  const adapter = new MailAdapter();

  it("has correct info", () => {
    assert.equal(adapter.info.name, "mail");
    assert.equal(adapter.info.bundleId, "com.apple.mail");
    assert.equal(adapter.info.itemType, "message");
    assert.equal(adapter.info.containerType, "mailbox");
  });

  it("listContainers returns mailboxes template", () => {
    assert.equal(adapter.listContainers().templateId, "mail.list_mailboxes");
  });

  it("list defaults to INBOX", () => {
    const result = adapter.list({});
    assert.equal(result.templateId, "mail.list_messages");
    assert.equal(result.parameters.mailboxName, "INBOX");
  });

  it("create returns draft template", () => {
    const result = adapter.create({ properties: { to: "a@b.com", subject: "Hi" } });
    assert.equal(result.templateId, "mail.create_draft");
    assert.equal(result.parameters.to, "a@b.com");
  });

  it("action send works", () => {
    const result = adapter.action({ action: "send", parameters: { to: "x@y.com", body: "hi" } });
    assert.equal(result.templateId, "mail.send");
  });

  it("action throws for unsupported", () => {
    assert.throws(
      () => adapter.action({ action: "play", parameters: {} }),
      UnsupportedOperationError
    );
  });
});

describe("ContactsAdapter", () => {
  const adapter = new ContactsAdapter();

  it("has correct info", () => {
    assert.equal(adapter.info.name, "contacts");
    assert.equal(adapter.info.bundleId, "com.apple.Contacts");
    assert.equal(adapter.info.itemType, "person");
    assert.equal(adapter.info.containerType, "group");
  });

  it("listContainers returns groups template", () => {
    assert.equal(adapter.listContainers().templateId, "contacts.list_groups");
  });

  it("create passes properties", () => {
    const result = adapter.create({ properties: { firstName: "John", lastName: "Doe" } });
    assert.equal(result.templateId, "contacts.create_person");
    assert.equal(result.parameters.firstName, "John");
  });

  it("search passes query", () => {
    const result = adapter.search({ query: "Smith" });
    assert.equal(result.templateId, "contacts.search_people");
    assert.equal(result.parameters.query, "Smith");
  });
});

describe("MessagesAdapter", () => {
  const adapter = new MessagesAdapter();

  it("has correct info", () => {
    assert.equal(adapter.info.name, "messages");
    assert.equal(adapter.info.bundleId, "com.apple.MobileSMS");
    assert.equal(adapter.info.capabilities.create, false);
    assert.equal(adapter.info.capabilities.update, false);
    assert.equal(adapter.info.capabilities.delete, false);
  });

  it("listContainers returns chats template", () => {
    assert.equal(adapter.listContainers().templateId, "messages.list_chats");
  });

  it("create throws UnsupportedOperationError", () => {
    assert.throws(
      () => adapter.create({ properties: {} }),
      UnsupportedOperationError
    );
  });

  it("update throws UnsupportedOperationError", () => {
    assert.throws(
      () => adapter.update({ id: "x", properties: {} }),
      UnsupportedOperationError
    );
  });

  it("delete throws UnsupportedOperationError", () => {
    assert.throws(
      () => adapter.delete("x"),
      UnsupportedOperationError
    );
  });

  it("action send works", () => {
    const result = adapter.action({ action: "send", parameters: { to: "+1234", message: "hi" } });
    assert.equal(result.templateId, "messages.send");
  });
});

describe("AppRegistry", () => {
  it("registers and retrieves adapters", () => {
    const registry = new AppRegistry();
    registry.register(new NotesAdapter());
    registry.register(new CalendarAdapter());

    assert.ok(registry.has("notes"));
    assert.ok(registry.has("calendar"));
    assert.ok(!registry.has("reminders"));
  });

  it("listApps returns all registered", () => {
    const registry = new AppRegistry();
    registry.register(new NotesAdapter());
    registry.register(new CalendarAdapter());
    registry.register(new RemindersAdapter());

    const apps = registry.listApps();
    assert.equal(apps.length, 3);
    assert.deepEqual(apps.map((a) => a.name).sort(), ["calendar", "notes", "reminders"]);
  });

  it("getOrThrow throws for unknown app", () => {
    const registry = new AppRegistry();
    assert.throws(() => registry.getOrThrow("unknown"), /Unknown app "unknown"/);
  });

  it("getOrThrow returns adapter for known app", () => {
    const registry = new AppRegistry();
    registry.register(new NotesAdapter());
    const adapter = registry.getOrThrow("notes");
    assert.equal(adapter.info.name, "notes");
  });
});
