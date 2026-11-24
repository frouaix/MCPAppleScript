# MCP-AppleScript

A local, **stdio-only** MCP server for controlled automation on macOS.

> [!CAUTION]
> This software can read, create, modify, and delete personal data in local apps.
> Enable only the access you need. A `readwrite` grant allows writes, not just drafts:
> some operations require additional user confirmation, but no safeguard is foolproof.
> Data returned to your MCP client may be sent to that client's model provider.
> This project is provided as-is, with no warranty. See [LICENSE](LICENSE).

## Architecture

```text
MCP client -> TypeScript server -> osascript -> macOS apps
                                -> native EventKit helper -> Calendar / Reminders
```

The server validates requests, enforces immutable per-app permissions, maps operations
through app adapters, and executes parameterized AppleScript or a Swift EventKit helper
for Calendar and Reminders. There is no HTTP listener, raw-script tool, or arbitrary-template tool.

Adapters exist for Notes, Calendar, Reminders, Mail, Contacts, Messages, Photos, Music,
Finder, and Safari. Support varies by app; not every app implements every CRUD operation.
AppleScript automation depends on macOS scripting support and Automation consent.

## Installation

For source builds, install Node.js 20.12.0+, pnpm 8+, and Xcode command-line tools
(including `swiftc` and `codesign`) on macOS:

```bash
git clone https://github.com/frouaix/MCPAppleScript.git
cd MCPAppleScript
./install.sh
```

The installer installs dependencies, builds TypeScript, and creates a configuration at
`~/.config/applescript-mcp/config.json` if one does not exist. **All access starts off**;
edit the permissions ceiling before use. Existing configuration is never overwritten.

For a standalone executable, download a `.dmg` from
[GitHub Releases](https://github.com/frouaix/MCPAppleScript/releases) and copy
`mcp-applescript` and `CalendarBridge.app` together to a directory in your PATH. Older releases may still implement the
previous permission model; these instructions describe the current source.

## Permissions and named profiles

Configuration is loaded from `~/.config/applescript-mcp/config.json`, or the file named
by `APPLESCRIPT_MCP_CONFIG`.

| Permission | Access |
|---|---|
| `off` | No app operations |
| `read` | List containers, list, get, search, and Music's `now_playing` action |
| `readwrite` | Read access plus supported creation, update, deletion, and actions |

`permissions` is the user-approved maximum. A named profile can only narrow it:

```json
{
  "permissions": {
    "default": "off",
    "apps": {
      "notes": "readwrite",
      "calendar": "readwrite",
      "mail": "read"
    }
  },
  "profiles": {
    "research": {
      "apps": {
        "notes": "read",
        "calendar": "read",
        "mail": "read"
      }
    },
    "organizer": {
      "apps": {
        "notes": "readwrite",
        "calendar": "readwrite"
      }
    }
  },
  "defaultTimeoutMs": 12000,
  "finder": { "allowedPaths": [] },
  "safari": { "doJavaScript": false },
  "logging": {
    "level": "info",
    "redact": ["email", "content", "body"]
  }
}
```

Use the short app names shown above and `reminders`, `contacts`, `messages`, `photos`,
`music`, `finder`, `safari` -- not bundle IDs. Unknown app names and invalid permissions
are rejected.

- Set `permissions.default` to `read` or `readwrite` to grant that maximum for all
  supported apps; explicit `permissions.apps` entries override it, including `off`.
- Each profile also has `default` and `apps`. Its default is `off`, so omitted apps
  are denied unless the profile explicitly sets a different default.
- **Effective access = the lower of the global maximum and the selected profile's
  grant, per app.** A profile requesting `readwrite` cannot exceed a global `read`.
- Without `--profile`, the instance uses the global permissions directly.
- Unknown profiles and unsupported CLI arguments fail startup. `--help` prints usage.
- Permissions are a startup snapshot. Edit the configuration and restart the instance
  to change them. No MCP tool can change grants.

Finder additionally requires `finder.allowedPaths`, for example `["~/Documents"]`.
Its default list/container operations target the home directory and are denied if
that directory is outside the allowlist; use an allowed `containerId` for list/search.
Paths are resolved, including existing symlinks, for validation and execution.
Safari's `do_javascript` additionally requires `safari.doJavaScript: true`.

### MCP client configuration

Configure separate stdio instances for separate trust contexts:

```json
{
  "mcpServers": {
    "mac-research": {
      "command": "node",
      "args": ["/path/to/MCPAppleScript/packages/mcp-server/dist/index.js", "--profile", "research"]
    },
    "mac-organizer": {
      "command": "node",
      "args": ["/path/to/MCPAppleScript/packages/mcp-server/dist/index.js", "--profile", "organizer"]
    }
  }
}
```

For the standalone executable, use `"command": "/usr/local/bin/mcp-applescript"`
and `"args": ["--profile", "research"]`.

**The MCP host must decide which instance a session can use.** Registering both
instances does not isolate conversations if the host exposes both to every session.
Use per-session server configuration when supported, or separate host configurations.
Profiles are not a sandbox against processes already running as your macOS user:
an agent with unrestricted shell/file access could change the config or bypass this server.

### macOS consent and confirmation

Server permissions and macOS Automation consent are separate checks. On first use,
macOS may ask permission for the launching application to control a target app.
Review **System Settings > Privacy & Security > Automation** if access is denied.
The exact attribution depends on how the client launches the server.

Calendar operations use EventKit and require a separate **Calendars: Full Access**
grant to the Calendar Bridge. macOS Full Access permits writes at the OS level;
the MCP server still enforces the selected profile, but that is not protection
against an agent with unrestricted shell access. Calendar's `show` action uses AppKit.

Updates, deletions, and actions named `send`, `move`, or `do_javascript` require user
confirmation through MCP **form elicitation**, in addition to `readwrite`.
If the client does not support form elicitation, those operations are blocked.
Declining or cancelling stops the operation; there is no model-echoed token fallback.
Dry runs still require the appropriate app permission and pass adapter validation,
but do not request confirmation or access app data.

Other supported writes (for example creation, reminder completion, and playback)
are authorized by `readwrite` without an additional confirmation prompt.

### Migrating old configuration

Legacy `apps`, `defaultMode`, `modes`, `runScript`, and `executorPath` keys now cause
an explicit startup error rather than being silently ignored.

Replace these sections with `permissions` and `profiles`, translating enabled apps
to short names and choosing `read` or `readwrite` explicitly. Disabled apps become
`off`. Tool allowlists do not migrate automatically. Remove mode-changing calls
from clients; use `applescript.get_permissions` to inspect access instead.
HTTP flags and the `applescript.run_script` / `applescript.run_template` tools have
been removed because they do not fit scoped stdio access.

## Tools

| Tool | Required access |
|---|---|
| `applescript.ping` | None; health and supported-app discovery |
| `applescript.get_permissions` | None; effective grants and selected profile |
| `calendar.list_calendars`, `calendar.list_events` | Calendar `read`; calendars and date-filtered schedules |
| `notes.list_folders`, `notes.list_notes`, `notes.search_notes`, `notes.get_note` | Notes `read`; browse, search titles/body, read content |
| `reminders.list_due` | Reminders `read`; incomplete reminders due today or tomorrow |
| `app.list_containers`, `app.list`, `app.get`, `app.search` | `read` |
| `app.create`, `app.update`, `app.delete` | `readwrite` |
| `app.action` | `readwrite`, except Music `now_playing` requires `read` |

Tools and generic `app` choices are filtered by the instance's effective permissions.
A Notes/Calendar read-only profile exposes their named read tools and generic reads,
not write tools. Server initialization instructions and tool descriptions tell agents
which apps contain notes, schedules, appointments, and meetings. Clients may ignore
initialization instructions; descriptions and input schemas carry that guidance too.
**Every call is authorized independently**, including direct calls and dry runs.
Unsupported adapter operations fail explicitly.

For "what's my schedule tomorrow?", use `calendar.list_events` with `{"day":"tomorrow"}`.
The Mac resolves local midnight boundaries, filters overlapping events, sorts them
chronologically, and returns paginated local timestamps with UTC offsets, including
recurring occurrences. EventKit may expose fewer calendars than Calendar displays;
compare `calendar.list_calendars` with the app before relying on completeness.
Reminders also use EventKit and require a separate macOS Reminders Full Access grant;
MCP read-only profiles remain enforced by the server, not by that OS grant.
See [docs/TOOLS.md](docs/TOOLS.md) for
date ranges, pagination, and Notes examples. Restart the MCP instance after rebuilding
to refresh the tools advertised to the client.

## Development

```bash
pnpm install
pnpm build
pnpm test:unit
pnpm test:integration
pnpm lint

# Real-app reads: opt in locally; may prompt for Automation consent
APPLESCRIPT_E2E=1 pnpm test:integration

# Run a selected profile
node packages/mcp-server/dist/index.js --profile research

# Build the standalone binary, then package it
pnpm build:sea
pnpm build:dmg
```

Protocol integration tests use temporary configuration and dry runs; they do not
access personal apps. Real-app tests are opt-in and perform reads only.
Passing protocol tests does not establish that every adapter works on your macOS version.

See [architecture](docs/ARCHITECTURE.md), [repository layout](docs/FILES.md),
[testing](docs/TESTING.md), and [contributing](CONTRIBUTING.md).

## License

MIT -- see [LICENSE](LICENSE).

## Author

François Rouaix
