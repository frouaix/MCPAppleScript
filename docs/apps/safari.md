# Safari

Uses AppleScript and requires macOS Automation consent.

- `app.list_containers`: list windows. `app.list` lists tabs in a window or the front window.
- `app.get`: get a tab's URL and source by `id` (`tabIndex:windowId`, or index in the front window). `app.search` searches tab titles and URLs.
- `app.create`: open `properties.url`, optionally with `newWindow: true`. `app.delete` closes a tab by ID.
- `app.action`: `show` opens Safari; `add_reading_list` takes `parameters.url` and optional `title`; `do_javascript` takes `script` and optional `tabIndex` and `windowId`.

Use `app: "safari"` for generic calls. Tab indices can change, and search result IDs are result positions rather than reliable tab indices; list the target window again before get or delete. JavaScript also requires `safari.doJavaScript: true` and Safari's own automation setting.

**Scenarios:** find an open tab by title or URL; add a URL to the Reading List.
