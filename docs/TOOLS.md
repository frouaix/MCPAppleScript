# Tool design

## Principles

- **Generic CRUD over per-app tools.** A single set of 8 CRUD tools (`app.list_containers`, `app.list`, `app.get`, `app.search`, `app.create`, `app.update`, `app.delete`, `app.action`) works across all 10 apps. Each app is selected via the `app` parameter.
- **Controlled AppleScript execution.** Templates are parameterized with strict schemas. User input is escaped at compile-time (`esc()`) and runtime (`jsonEsc()`).
- **Defense-in-depth security.** Three layers: operation modes, policy allowlists, and confirmation tokens for destructive actions.
- **Explicit opt-in.** Nothing works unless configured. Finder requires `allowedPaths`. Safari `do_javascript` must be enabled. `run_script` is disabled by default.
- **Dry-run support.** Every tool supports `dryRun: true` to return the generated AppleScript without executing it.

## Tool set

### System tools (always available)

| Tool | Mode | Description |
|------|------|-------------|
| `applescript.ping` | readonly | Health check — returns version, app list |
| `applescript.get_mode` | readonly | Get current operation mode and enabled tools |
| `applescript.set_mode` | readonly | Change mode (`readonly`, `create`, `full`) |

### CRUD tools (mode-gated)

| Tool | Mode | Description |
|------|------|-------------|
| `app.list_containers` | readonly | List containers (folders, calendars, lists, etc.) |
| `app.list` | readonly | List items (paginated: `limit`, `offset`) |
| `app.get` | readonly | Get a single item by ID |
| `app.search` | readonly | Search/filter items by query |
| `app.create` | create | Create a new item (app-specific properties) |
| `app.update` | full | Update an existing item (confirmation required) |
| `app.delete` | full | Delete an item (confirmation required) |
| `app.action` | create | App-specific action (show, complete, send, play, etc.) |

All CRUD tools accept an `app` parameter (e.g. `"notes"`, `"calendar"`, `"finder"`) and a `dryRun` flag.

### Script tools (policy-gated)

| Tool | Mode | Description |
|------|------|-------------|
| `applescript.run_template` | create | Execute a registered template by ID + bundle ID |
| `applescript.run_script` | full | Execute raw AppleScript (confirmation required, policy-gated) |

## Supported apps (10)

| App | Bundle ID | Item Type | Container Type |
|-----|-----------|-----------|----------------|
| Notes | `com.apple.Notes` | note | folder |
| Calendar | `com.apple.iCal` | event | calendar |
| Reminders | `com.apple.reminders` | reminder | list |
| Mail | `com.apple.mail` | message | mailbox |
| Contacts | `com.apple.Contacts` | person | group |
| Messages | `com.apple.MobileSMS` | message | chat |
| Photos | `com.apple.Photos` | media | album |
| Music | `com.apple.Music` | track | playlist |
| Finder | `com.apple.finder` | file | folder |
| Safari | `com.apple.Safari` | tab | window |

## Operation modes

Three cumulative modes control tool availability:

| Mode | Tools available |
|------|----------------|
| **readonly** | `ping`, `get_mode`, `set_mode`, `list_containers`, `list`, `get`, `search` |
| **create** | readonly + `create`, `action`, `run_template` |
| **full** | create + `update`, `delete`, `run_script` |

Modes are configurable via `config.modes`. Each mode lists the tools introduced at that level; modes are cumulative.

## Confirmation system

Destructive actions (`update`, `delete`, `run_script`, `run_template`) require confirmation:

1. **MCP elicitation** — server asks the client to show a confirmation dialog
2. **Confirmation token** — fallback: server issues a token that must be passed back on a second call (2-minute TTL, single-use)

## Template approach

Templates are parameterized AppleScript builders in `templates/`. Each app has a module that exports a `build(templateId, bundleId, parameters)` function.

### Escaping (two layers)

1. **Compile-time** (`esc()`): Escapes `\` and `"` in user parameters for safe embedding in AppleScript string literals.
2. **Runtime** (`jsonEsc()`): AppleScript handlers appended to every script that escape values for safe JSON output (`\`, `"`, CR, LF, tab).

### Template ID convention

`<app>.<operation>` — e.g. `notes.list_notes`, `calendar.create_event`, `finder.delete_item`

## Configuration & policy model

Config file: `~/.config/applescript-mcp/config.json` or `APPLESCRIPT_MCP_CONFIG` env var.

```json
{
  "defaultTimeoutMs": 12000,
  "defaultMode": "readonly",
  "modes": {
    "readonly": ["applescript.ping", "applescript.get_mode", "applescript.set_mode", "app.list_containers", "app.list", "app.get", "app.search"],
    "create": ["app.create", "app.action", "applescript.run_template"],
    "full": ["app.update", "app.delete", "applescript.run_script"]
  },
  "apps": {
    "com.apple.Notes": {
      "enabled": true,
      "allowedTools": []
    }
  },
  "runScript": {
    "enabled": false,
    "allowedBundleIds": []
  },
  "safari": {
    "doJavaScript": false
  },
  "finder": {
    "allowedPaths": []
  },
  "logging": {
    "level": "info",
    "redact": ["email", "content", "body"]
  }
}
```

### Config sections

| Section | Purpose |
|---------|---------|
| `defaultTimeoutMs` | Default osascript timeout in ms (default: 12000) |
| `defaultMode` | Initial operation mode (default: `readonly`) |
| `modes` | Tool-to-mode mapping (default matches defaults below) |
| `apps.<bundleId>` | Per-app config: `enabled` (boolean), `allowedTools` (string[]) |
| `runScript` | Global `run_script` gating: `enabled` (boolean), `allowedBundleIds` (string[]) |
| `safari.doJavaScript` | Gate Safari `do_javascript` action (default: false) |
| `finder.allowedPaths` | Path allowlist for Finder operations (default: empty = deny all) |
| `logging.level` | Log level: `debug`, `info`, `warn`, `error` |
| `logging.redact` | Field names to redact from log output |

### Enforcement rules

- **Apps not in config** → denied with explicit error.
- **Tools not in app's `allowedTools`** → denied (empty list = allow all for that app).
- **`run_script`** → disabled by default; requires explicit `enabled: true` + optional `allowedBundleIds`.
- **Safari `do_javascript`** → disabled by default; requires explicit `safari.doJavaScript: true`.
- **Finder paths** → denied by default; requires explicit `finder.allowedPaths` list.
- **Timeouts** → always enforced.
- **Sensitive fields** → redacted in logs based on `logging.redact`.
- **Confirmation** → required for update, delete, run_script, run_template.
