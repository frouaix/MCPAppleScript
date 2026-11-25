# Messages

Uses AppleScript and requires macOS Automation consent. Message-history support depends on the installed Messages scripting interface and has not been verified.

- `app.list_containers`: list chats and participants.
- `app.list`: request message metadata, optionally within a chat `containerId`.
- `app.get`: get chat details using a chat ID. `app.search` searches chat names.
- `app.action` with `send`: send using `parameters.to` and `message`, optionally `service: "SMS"`; default is iMessage. `show` opens Messages.

Use `app: "messages"` for generic calls. Create, update, and delete are unsupported; the implemented message listing does not return message bodies.

**Scenarios:** find a chat by name; send a message to a phone number or email address.
