# Finder

Uses AppleScript and requires macOS Automation consent. Configure `finder.allowedPaths` separately; an empty allowlist denies Finder access.

- `app.list_containers`: list folders in the home directory. `app.list` browses an allowed `containerId` path; `app.get` reads item metadata by path.
- `app.search`: search item names in an allowed folder, not recursively.
- `app.create`: create a folder using `properties.name` and optional parent `containerId`. `app.update` moves an item using `id` and `properties.destPath`; `app.delete` deletes an item.
- `app.action`: `show` optionally opens `parameters.path`; `reveal` reveals a path; `move` and `duplicate` use `sourcePath` and `destPath`.

Use `app: "finder"` for generic calls. For `move`, `destPath` is required; for `duplicate` it is optional. Paths must be allowed, including the home directory when using defaults.

**Scenarios:** list items in an allowed Documents folder; find a file by name and reveal it.
