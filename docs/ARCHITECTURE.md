# Architecture

MCP-AppleScript is a local stdio MCP server. A TypeScript process executes parameterized
AppleScript through `child_process.execFile("osascript", ["-e", script])` without a shell.
Calendar and Reminders operations use a bundled Swift EventKit helper (AppKit opens the apps).
There is no HTTP transport.

```text
Trusted host selects --profile NAME
  -> config schema validates global ceiling and named profile
  -> PolicyEngine snapshots effective app grants
  -> stdio MCP connection
  -> Zod tool input validation
  -> per-call permission check
  -> adapter validation (Finder paths / Safari JavaScript)
  -> ResourceAdapter maps to an internal template
  -> user confirmation when required
  -> Calendar and Reminders: helper over JSON stdin -> EventKit / AppKit
     Other apps: template -> osascript -> Apple Events
  -> JSON result or error returned
```

## Permission boundary

The global `permissions` and each named profile have a `default` permission and
per-app `apps` overrides. Defaults are `off`; app names are validated against the
supported-app enum. For each app, the selected profile's grant is intersected with
the global ceiling using `off < read < readwrite`.

Without a profile, global grants are used. Unknown profiles fail startup. Grants are
frozen at startup and cannot be changed through MCP; config changes require restart.
Separate instances keep separate grants, with no shared mutable policy.

The host must restrict which instance a conversation can use. Profiles do not sandbox
an agent with unrestricted shell access as the same macOS user. macOS TCC/Automation
consent is a separate enforcement layer, not a read/write permission system.
EventKit requires separate macOS Calendars and Reminders Full Access grants, which allow writes at the OS level;
the server's profile independently enforces read versus readwrite.

Tool visibility and generic app enums reflect effective grants; every call is still
checked. Calendar and Notes expose task-specific read tools alongside generic reads.
Initialization instructions describe workflows and limitations for enabled apps.
Music `now_playing` is the
only read-only app action; other actions require `readwrite`. Updates, deletions, and
send/move/JavaScript actions require explicit user confirmation via MCP form elicitation.
There is no confirmation-token fallback or arbitrary script/template dispatch tool.

Finder validation resolves paths and existing symlinks against a separate allowlist;
execution uses resolved paths as well. This is not a filesystem sandbox or protection
against concurrent filesystem changes by other local processes.

## Modules

| Path under `packages/mcp-server/src/` | Responsibility |
|---|---|
| `index.ts`, `cli.ts` | Stdio startup and strict profile argument parsing |
| `server.ts` | Adapter registry, fixed policy, tool wiring, execution |
| `config/` | File/env path loading, strict schema, legacy config errors |
| `policy/policy.ts` | Effective permission snapshot and per-call authorization |
| `tools/system-tools.ts` | Health and permission inspection |
| `tools/crud-tools.ts` | Generic app operations, validation, confirmation |
| `tools/app-read-tools.ts` | Discoverable Calendar/Notes reads and local-day range resolution |
| `mode/confirmation.ts` | User confirmation via form elicitation only |
| `adapters/` | ResourceAdapter implementations and app-specific validation |
| `templates/` | Internal parameterized AppleScript builders and escaping |
| `exec/` | osascript and EventKit helper invocation, timeouts and errors |
| `util/` | Typed errors, JSON utilities, stderr logging |

`ResourceAdapter` maps generic operations to `{ templateId, parameters }`.
Unsupported operations throw `UnsupportedOperationError`. The template dispatcher
selects a per-app builder by prefix. Templates are not directly exposed to clients.

See [tools](TOOLS.md), [internal executor contracts](CONTRACTS.md), and
[testing](TESTING.md).
