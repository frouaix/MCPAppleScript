# Reminders

Uses EventKit. Reminders Full Access permits OS-level writes even with an MCP read-only grant.

- `reminders.list_due`: list incomplete reminders due today or tomorrow, with optional `listId` and pagination; excludes overdue reminders.
- `app.list_containers`, `app.list`, `app.get`, `app.search`: list reminder lists, browse or get reminders, and search titles.
- `app.create`, `app.update`, `app.delete`: create, update, or delete a reminder. Create requires `properties.name`; supported fields also include `body`, `dueDate`, `priority`, and `completed`.
- `app.action` with `complete` and `parameters.reminderId`: mark a reminder complete. `show` opens Reminders.

Use `app: "reminders"` for generic calls. Lists and recurring reminders may differ from the app; `flagged` is not supported. See [details](../TOOLS.md#reminders).

**Scenarios:** retrieve five reminders due today with `reminders.list_due` and `limit: 5`; find a reminder and mark it complete.
