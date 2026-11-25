# Contacts

Uses the Contacts framework. The macOS Contacts grant permits OS-level writes even with an MCP read-only grant.

- `contacts.search`: find people by name, organization, email, or phone; optionally filter by `groupId` and paginate.
- `contacts.get`: read a contact by `contactId`, including labeled emails and phones.
- `app.list_containers`, `app.list`, `app.get`, `app.search`: list groups, browse or get contacts, and search.
- `app.create`, `app.update`, `app.delete`: create, update, or delete a contact. Supported properties are `firstName`, `lastName`, `organization`, `jobTitle`, `emails`, and `phones`.
- `app.action` with `show`: open Contacts.

Use `app: "contacts"` for generic calls. Create requires a name or organization; updating emails or phones replaces the entire array. Contact notes are not exposed. See [details](../TOOLS.md#contacts).

**Scenarios:** search for a person and retrieve their phone numbers; browse contacts in a group.
