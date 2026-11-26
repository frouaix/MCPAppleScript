# Messages

Uses AppleScript and requires macOS Automation consent. Apple's scripting interface does not expose message history; `app.list` is unsupported.

- `app.list_containers`: list chats and participants.
- `app.get`: get chat details using a chat ID. `app.search` searches chat names.
- `app.action` with `send`: send using `parameters.to` and `message`, optionally `service: "SMS"`; default is iMessage. `show` opens Messages.

Use `app: "messages"` for generic calls. Create, update, and delete are unsupported.

**Scenarios:** find a chat by name; send a message to a phone number or email address.
