# Architecture

## Overview

MCP-AppleScript is a local Model Context Protocol (MCP) server that exposes controlled AppleScript automation tools to MCP clients on macOS. It bridges the [Model Context Protocol](https://modelcontextprotocol.io/) to macOS applications via AppleScript.

**Two components:**
- **MCP Server** (TypeScript/Node.js): Handles MCP protocol, tool schemas, configuration, validation, logging, and policy enforcement.
- **osascript executor**: Runs AppleScript commands via `child_process.execFile` (no shell) and returns structured JSON results.

> **Warning:** This software can read, create, modify, and delete personal data across 10 Apple apps. Users are solely responsible for configuration and safety.

## High-level process

```
MCP tool call → Node validates & enforces policy & mode →
  template builds AppleScript → osascript executes →
  JSON result returned → Node maps to MCP result
```

### Process

**MCP Server** (Node/TS)
- Speaks MCP over **stdio** (default) or **Streamable HTTP** (`--http` flag).
- Registers tools (`tools/list`, `tools/call`) with JSON Schemas via Zod.
- Loads config from `~/.config/applescript-mcp/config.json` or `APPLESCRIPT_MCP_CONFIG` env var.
- Validates tool inputs against Zod schemas.
- Translates tool calls to template ID + parameters via **ResourceAdapter** pattern.
- Builds AppleScript source from TypeScript templates with compile-time escaping.
- Executes via `osascript -e <script>` using `execFile` (no shell).
- Returns structured results and errors.

### Data flow

```
MCP tool call
  → Zod validates parameters
  → PolicyEngine checks allowlists / mode / runScript config
  → ModeManager checks operation mode (readonly/create/full)
  → ConfirmationManager checks destructive-action confirmation
  → ResourceAdapter maps → {templateId, parameters}
  → Template builder generates AppleScript (with esc() escaping)
  → wrapScript() appends runtime JSON handlers
  → osascript executes
  → JSON result parsed → MCP result returned
```

## Module layout

```
packages/mcp-server/src/
  index.ts              # CLI entrypoint (stdio + HTTP)
  server.ts             # MCP server setup + tool registration
  http.ts               # Streamable HTTP transport (Express)
  tools/                # Tool registration modules
    system-tools.ts     # applescript.ping, get_mode, set_mode
    crud-tools.ts       # app.list_containers, list, get, search, create, update, delete, action
    script-tools.ts     # applescript.run_template, applescript.run_script
  adapters/             # per-app resource adapters
    types.ts            # ResourceAdapter interface, ValidationContext, ValidationResult
    registry.ts         # AppRegistry lookup
    notes.ts, calendar.ts, reminders.ts, mail.ts,
    contacts.ts, messages.ts, photos.ts, music.ts,
    finder.ts, safari.ts
  templates/            # AppleScript template builders
    index.ts            # dispatcher (routes by prefix)
    escape.ts           # esc(), wrapScript(), jsonEscHandlers
    notes.ts, calendar.ts, ...
  exec/
    executor.ts         # osascript execution via execFile
    types.ts            # ExecutorRequest/Response interfaces
  policy/
    policy.ts           # allowlists/denylists + enforcement
  config/
    config.ts           # load/merge config (file/env)
    schema.ts           # zod schemas (AppConfig, FinderConfig, SafariConfig, etc.)
  mode/
    mode.ts             # operation mode management (readonly/create/full)
    confirmation.ts     # confirmation tokens + elicitation
  util/
    errors.ts           # McpAppleScriptError + typed error codes
    json.ts             # JSON utilities
    logging.ts          # Logger with field redaction
test/
  unit/                 # unit tests (all frameworks)
  integration/          # macOS-only e2e tests
```

## Key patterns

### ResourceAdapter

Each app implements `ResourceAdapter`, mapping generic CRUD operations to app-specific template IDs and parameters. Apps that support only a subset of operations throw `UnsupportedOperationError`.

```typescript
interface ResourceAdapter {
  listContainers(): { templateId: string; parameters: Record<string, unknown> };
  list(params: ListParams): { templateId: string; parameters: Record<string, unknown> };
  // ...
  validateParams?(params, context): ValidationResult;
}
```

### Validation

Adapters declare which MCP parameters require validation via `requiredValidation`. The `validateParams()` method returns `{ valid, error? }`. This is used by:
- **Finder**: path allowlist enforcement (`finder.allowedPaths`)
- **Safari**: `do_javascript` gating (`safari.doJavaScript`)
- Other adapters: no validation needed (`requiredValidation: []`)

### Operation modes

Three cumulative modes control tool availability:
- **readonly** — read-only tools only (default)
- **create** — + create, action, run_template
- **full** — + update, delete, run_script (all require confirmation)

### Confirmation

Destructive actions (update, delete, run_script, run_template) require confirmation via:
1. **MCP elicitation** — server asks client to show a dialog
2. **Confirmation tokens** — fallback: issue a token the user must pass back on retry (2-minute TTL)
