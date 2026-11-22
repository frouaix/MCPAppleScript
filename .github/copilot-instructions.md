# MCP-AppleScript — Copilot Instructions

## Build & Test Commands

```bash
pnpm install                    # Install all dependencies
pnpm build                      # Build TypeScript
pnpm test:unit                  # TypeScript unit tests
pnpm test:integration           # Stdio protocol tests; real-app reads require APPLESCRIPT_E2E=1
pnpm lint                       # ESLint
pnpm format                     # Prettier

# Single test file
cd packages/mcp-server && npx tsx --test test/unit/policy.test.ts

# Standalone binary
pnpm build:sea                  # Node.js SEA binary
pnpm build:dmg                  # Package as .dmg
```

## Architecture

Single-process TypeScript architecture using `osascript` for AppleScript execution:

```
MCP Client → TypeScript MCP Server → osascript → macOS Apps (via Apple Events)
               (protocol, policy,     (CLI tool)
                adapters, templates)
```

**Transport**: stdio only. Select an immutable permission profile with `--profile NAME`.

**Data flow for a tool call**: MCP request → Zod validation → per-app permission check → adapter validation → `ResourceAdapter` maps to `{templateId, parameters}` → user confirmation when required → TypeScript template builder generates AppleScript → executed via `osascript` → JSON result returned.

### ResourceAdapter Pattern

The core abstraction. Each of the 10 Apple apps has a TypeScript adapter (`packages/mcp-server/src/adapters/`) and a TypeScript template module (`packages/mcp-server/src/templates/{app}.ts`).

The adapter maps generic CRUD operations (`list`, `get`, `search`, `create`, `update`, `delete`, `action`) to `{templateId, parameters}` pairs. The template dispatcher routes by template ID prefix (e.g. `notes.create_note` → `notes.build()`).

Apps that don't support an operation throw `UnsupportedOperationError`.

### Immutable Per-App Permissions

`config.permissions` is the global ceiling. `config.profiles[NAME]` can only narrow it.
Each has `default` (defaults to `off`) and `apps` keyed by short app names, not bundle IDs.

- **off**: no app access (default)
- **read**: list containers, list, get, search, Music `now_playing`
- **readwrite**: read plus supported writes/actions; update/delete/send/move/JavaScript require form elicitation

Tools and app enums reflect effective grants; every call is authorized, including dry runs. No MCP tool changes
permissions or executes arbitrary templates/scripts. `applescript.get_permissions`
reports the selected profile and effective grants. Missing elicitation support blocks
consequential writes; declined confirmation never falls back to model-visible tokens.

## Executor

The executor uses `child_process.execFile('osascript', ['-e', script])` — no shell involved. Error classification maps osascript stderr patterns to error codes:

- `-1743` → `AUTOMATION_DENIED`
- `-600`/`-10810` → `APP_NOT_RUNNING`
- Other → `SCRIPT_ERROR`

Error codes: `AUTOMATION_DENIED`, `APP_NOT_RUNNING`, `SCRIPT_ERROR`, `TIMEOUT`, `INVALID_REQUEST`, `EXECUTOR_FAILED`, `POLICY_DENIED`, `CONFIG_ERROR`, `UNKNOWN_ERROR`

## Key Conventions

### TypeScript
- **Testing**: `node:test` (no external frameworks). Tests use `describe`/`it` with `node:assert/strict`.
- **Validation**: All tool inputs validated with Zod schemas (max-length constraints enforced).
- **Errors**: Use `McpAppleScriptError` with typed error codes. Subclasses: `PolicyDeniedError`, `ExecutorError`, `ConfigError`.
- **Formatting**: Prettier — double quotes, semicolons, 100 char width, trailing commas `es5`.
- **Module system**: ESM (`"type": "module"`), `.js` extensions in imports. Target ES2022, `Node16` module resolution.
- **Strict TS**: `strict`, `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`, `noUncheckedIndexedAccess`.

### Template Escaping
- `esc()` — compile-time: escapes `\` and `"` for embedding user params in AppleScript string literals.
- `jsonEscHandlers` — runtime: AppleScript handlers appended to every script for safe JSON output.
- `wrapScript()` appends the jsonEsc/replaceText handlers to every template script.

### Template ID Convention
Template IDs follow `{appPrefix}.{operation}` format: `notes.create_note`, `calendar.list_events`, `finder.move_item`. The prefix must match the adapter's `info.name`.

## Adding a New App Adapter

1. Create `packages/mcp-server/src/adapters/{app}.ts` implementing `ResourceAdapter`
2. Register it in `packages/mcp-server/src/adapters/index.ts` and in `createServer()` in `server.ts`
3. Create `packages/mcp-server/src/templates/{app}.ts` with `export function build(templateId, bundleId, parameters)`
4. Add the prefix to the `builders` map in `packages/mcp-server/src/templates/index.ts`
5. Add app config and policy entries
6. Write unit tests in `test/unit/adapters.test.ts`

## CI

GitHub Actions on `macos-latest` runs: lint → build → unit tests → integration tests.
