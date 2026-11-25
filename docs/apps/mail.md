# Mail

Uses AppleScript and requires macOS Automation consent. These operations are implemented but have not all been verified against a real Mail setup.

- `app.list_containers`: list account mailboxes.
- `app.list`: list messages in a mailbox named by `containerId`, defaulting to `INBOX`.
- `app.get`: read a message by ID, including its body. `app.search` searches subjects across account mailboxes.
- `app.create`: create a visible draft using `properties.to`, optional `subject`, and `body`.
- `app.update`: set a message's `read` or `flagged` status. `app.delete` deletes a message.
- `app.action` with `send`: send a new message using `parameters.to`, optional `subject`, and `body`; `show` opens Mail.

Use `app: "mail"` for generic calls. Mailbox listing returns account/name IDs, while message listing addresses a mailbox by name; account-qualified IDs may not work there.

**Scenarios:** search for a subject and read a result; prepare a draft for review.
