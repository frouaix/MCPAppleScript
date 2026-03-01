# MCP-AppleScript — Copilot Instructions

## Build & Test Commands

```bash
pnpm install                    # Install all dependencies
pnpm build                      # Build TypeScript
pnpm test:unit                  # ~150 TypeScript unit tests
pnpm test:integration           # Integration tests (requires macOS + TCC permissions)
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

**Transports**: stdio (default) or Streamable HTTP (`--http` flag).

**Data flow for a tool call**: MCP request → Zod validation → policy check → mode gate → `ResourceAdapter` maps to `{templateId, parameters}` → TypeScript template builder generates AppleScript → executed via `osascript` → JSON result returned.

### ResourceAdapter Pattern

The core abstraction. Each of the 10 Apple apps has a TypeScript adapter (`packages/mcp-server/src/adapters/`) and a TypeScript template module (`packages/mcp-server/src/templates/{app}.ts`).

The adapter maps generic CRUD operations (`list`, `get`, `search`, `create`, `update`, `delete`, `action`) to `{templateId, parameters}` pairs. The template dispatcher routes by template ID prefix (e.g. `notes.create_note` → `notes.build()`).

Apps that don't support an operation throw `UnsupportedOperationError`.

### Three Operation Modes

Modes are cumulative and configurable via `config.modes`. Tool-to-mode mapping can be overridden to promote/restrict tools.

- **readonly** (default): `ping`, `get_mode`, `set_mode`, `app.list_containers`, `app.list`, `app.get`, `app.search`
- **create**: + `app.create`, `app.action`, `applescript.run_template`
- **full**: + `app.update`, `app.delete`, `applescript.run_script` (all require user confirmation via MCP elicitation or confirmation token)

Mode changes use `RegisteredTool.enable()/disable()` and emit `notifications/tools/list_changed`.

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
