import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { NotesAdapter } from "../../src/adapters/notes.js";
import { CalendarAdapter } from "../../src/adapters/calendar.js";
import { RemindersAdapter } from "../../src/adapters/reminders.js";
import { MailAdapter } from "../../src/adapters/mail.js";
import { ContactsAdapter } from "../../src/adapters/contacts.js";
import { MessagesAdapter } from "../../src/adapters/messages.js";
import { PhotosAdapter } from "../../src/adapters/photos.js";
import { MusicAdapter } from "../../src/adapters/music.js";
import { FinderAdapter } from "../../src/adapters/finder.js";
import { SafariAdapter } from "../../src/adapters/safari.js";
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

describe("PhotosAdapter", () => {
  const adapter = new PhotosAdapter();

  it("has correct info", () => {
    assert.equal(adapter.info.name, "photos");
    assert.equal(adapter.info.bundleId, "com.apple.Photos");
    assert.equal(adapter.info.capabilities.update, false);
    assert.equal(adapter.info.capabilities.delete, false);
  });

  it("listContainers returns albums template", () => {
    assert.equal(adapter.listContainers().templateId, "photos.list_albums");
  });

  it("create returns create_album template", () => {
    const result = adapter.create({ properties: { name: "Vacation" } });
    assert.equal(result.templateId, "photos.create_album");
    assert.equal(result.parameters.name, "Vacation");
  });

  it("update throws UnsupportedOperationError", () => {
    assert.throws(
      () => adapter.update({ id: "x", properties: {} }),
      UnsupportedOperationError
    );
  });

  it("action import works", () => {
    const result = adapter.action({ action: "import", parameters: { filePath: "/tmp/photo.jpg" } });
    assert.equal(result.templateId, "photos.import");
  });
});

describe("MusicAdapter", () => {
  const adapter = new MusicAdapter();

  it("has correct info", () => {
    assert.equal(adapter.info.name, "music");
    assert.equal(adapter.info.bundleId, "com.apple.Music");
    assert.ok(adapter.info.capabilities.actions.includes("play"));
    assert.ok(adapter.info.capabilities.actions.includes("now_playing"));
  });

  it("listContainers returns playlists template", () => {
    assert.equal(adapter.listContainers().templateId, "music.list_playlists");
  });

  it("search passes query", () => {
    const result = adapter.search({ query: "Beatles" });
    assert.equal(result.templateId, "music.search_tracks");
    assert.equal(result.parameters.query, "Beatles");
  });

  it("action play works", () => {
    const result = adapter.action({ action: "play", parameters: { trackId: "123" } });
    assert.equal(result.templateId, "music.play");
  });

  it("action now_playing works", () => {
    const result = adapter.action({ action: "now_playing", parameters: {} });
    assert.equal(result.templateId, "music.now_playing");
  });

  it("action throws for unsupported", () => {
    assert.throws(
      () => adapter.action({ action: "delete", parameters: {} }),
      UnsupportedOperationError
    );
  });
});

describe("FinderAdapter", () => {
  const adapter = new FinderAdapter();

  it("has correct info", () => {
    assert.equal(adapter.info.name, "finder");
    assert.equal(adapter.info.bundleId, "com.apple.finder");
    assert.equal(adapter.info.itemType, "file");
    assert.equal(adapter.info.containerType, "folder");
  });

  it("list defaults to home directory", () => {
    const result = adapter.list({});
    assert.equal(result.templateId, "finder.list_items");
    assert.equal(result.parameters.path, "~");
  });

  it("get uses path as id", () => {
    const result = adapter.get("/Users/test/file.txt");
    assert.equal(result.templateId, "finder.get_item");
    assert.equal(result.parameters.path, "/Users/test/file.txt");
  });

  it("create returns create_folder template", () => {
    const result = adapter.create({ containerId: "/tmp", properties: { name: "test" } });
    assert.equal(result.templateId, "finder.create_folder");
    assert.equal(result.parameters.parentPath, "/tmp");
    assert.equal(result.parameters.name, "test");
  });

  it("delete uses path as id", () => {
    const result = adapter.delete("/tmp/old");
    assert.equal(result.templateId, "finder.delete_item");
    assert.equal(result.parameters.path, "/tmp/old");
  });

  it("action reveal works", () => {
    const result = adapter.action({ action: "reveal", parameters: { path: "/tmp/x" } });
    assert.equal(result.templateId, "finder.reveal");
  });

  it("action throws for unsupported", () => {
    assert.throws(
      () => adapter.action({ action: "play", parameters: {} }),
      UnsupportedOperationError
    );
  });
});

describe("SafariAdapter", () => {
  const adapter = new SafariAdapter();

  it("has correct info", () => {
    assert.equal(adapter.info.name, "safari");
    assert.equal(adapter.info.bundleId, "com.apple.Safari");
    assert.equal(adapter.info.itemType, "tab");
    assert.equal(adapter.info.containerType, "window");
    assert.equal(adapter.info.capabilities.update, false);
  });

  it("listContainers returns windows template", () => {
    assert.equal(adapter.listContainers().templateId, "safari.list_windows");
  });

  it("list returns tabs template", () => {
    const result = adapter.list({});
    assert.equal(result.templateId, "safari.list_tabs");
  });

  it("get parses tabIndex:windowId format", () => {
    const result = adapter.get("3:42");
    assert.equal(result.templateId, "safari.get_tab");
    assert.equal(result.parameters.tabIndex, 3);
    assert.equal(result.parameters.windowId, 42);
  });

  it("create returns open_url template", () => {
    const result = adapter.create({ properties: { url: "https://example.com" } });
    assert.equal(result.templateId, "safari.open_url");
    assert.equal(result.parameters.url, "https://example.com");
  });

  it("update throws UnsupportedOperationError", () => {
    assert.throws(
      () => adapter.update({ id: "1", properties: {} }),
      UnsupportedOperationError
    );
  });

  it("delete returns close_tab template", () => {
    const result = adapter.delete("2:10");
    assert.equal(result.templateId, "safari.close_tab");
    assert.equal(result.parameters.tabIndex, 2);
  });

  it("action do_javascript works", () => {
    const result = adapter.action({ action: "do_javascript", parameters: { script: "document.title" } });
    assert.equal(result.templateId, "safari.do_javascript");
  });

  it("action add_reading_list works", () => {
    const result = adapter.action({ action: "add_reading_list", parameters: { url: "https://x.com" } });
    assert.equal(result.templateId, "safari.add_reading_list");
  });

  it("action throws for unsupported", () => {
    assert.throws(
      () => adapter.action({ action: "play", parameters: {} }),
      UnsupportedOperationError
    );
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
