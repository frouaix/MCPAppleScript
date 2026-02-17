# Tool design

## Principles
- Prefer specific tools over “run arbitrary AppleScript”.
- Make tools idempotent where possible or clearly “actionful”.
- All tools return structured output plus a human-readable summary.

## Baseline tool set (v1)
1. applescript.list_apps
   - Returns configured apps + their policy status.
1. applescript.run_template
   - Executes a known, versioned template (safe-ish).
1. App-specific tools (start with 2–3 apps you use)
   - notes.create_note
   - calendar.create_event
   - mail.compose_draft
1. Optional, gated
   - applescript.run_script (disabled by default; allowlist-only)

## Template approach

Instead of allowing arbitrary scripts, store templates in mcp-server/src/templates/.
Templates are parameterized with strict schemas, e.g.:
- notes/create_note.applescript
- calendar/create_event.applescript

Node fills in parameters safely (escaping) or passes parameters separately and uses AppleScript handlers.

## Configuration & policy model

Config file

Support a config file at:
- ~/.config/applescript-mcp/config.json (or config.yaml)
- override via env var APPLESCRIPT_MCP_CONFIG

Example config.json:
```
{
  "executorPath": "/usr/local/bin/applescript-executor",
  "defaultTimeoutMs": 12000,
  "apps": {
    "com.apple.Notes": {
      "enabled": true,
      "allowedTools": ["notes.create_note", "applescript.run_template"]
    },
    "com.apple.Calendar": {
      "enabled": true,
      "allowedTools": ["calendar.create_event"]
    }
  },
  "runScript": {
    "enabled": false,
    "allowedBundleIds": []
  },
  "logging": {
    "level": "info",
    "redact": ["email", "content"]
  }
}
```

### Enforcement rules
- If app/tool not allowlisted → deny with explicit error.
- Timeouts always enforced.
- Redact sensitive fields in logs.
- run_script disabled unless explicitly enabled.
- Optional “confirmation mode”:
   - For destructive or wide-impact actions, require a “confirm” boolean or a “dryRun” first.

   