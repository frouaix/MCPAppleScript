# MCP-AppleScript — Copilot Instructions

## Build & Test Commands

```bash
pnpm install                    # Install all dependencies
pnpm build                      # Build TypeScript + Swift
pnpm test:unit                  # ~150 TypeScript unit tests
pnpm test:integration           # 4 integration tests (requires macOS + TCC permissions)
pnpm lint                       # ESLint
pnpm format                     # Prettier

# Single test file
cd packages/mcp-server && npx tsx --test test/unit/policy.test.ts

# Swift executor
cd packages/executor-swift && swift build
cd packages/executor-swift && swift test

# Standalone binary
pnpm build:sea                  # Node.js SEA + embedded Swift executor
pnpm build:dmg                  # Package as .dmg
```

## Architecture

Two-process architecture connected via JSON over stdin/stdout:

```
MCP Client → TypeScript MCP Server → Swift Executor → macOS Apps (via Apple Events)
               (protocol, policy,      (NSAppleScript,
                adapters, config)        templates)
```

**Data flow for a tool call**: MCP request → Zod validation → policy check → mode gate → `ResourceAdapter` maps to `{templateId, parameters}` → executor spawned → Swift builds AppleScript from template → executes via `NSAppleScript` → JSON result returned.

### ResourceAdapter Pattern

The core abstraction. Each of the 10 Apple apps has a TypeScript adapter (`packages/mcp-server/src/adapters/`) and a Swift template file (`packages/executor-swift/Sources/Executor/{App}Templates.swift`).

The adapter maps generic CRUD operations (`list`, `get`, `search`, `create`, `update`, `delete`, `action`) to `{templateId, parameters}` pairs. The Swift executor dispatches by template ID prefix (e.g. `notes.create_note` → `NotesTemplates.build()`).

Apps that don't support an operation throw `UnsupportedOperationError`.

### Three Operation Modes

Modes are cumulative and configurable via `config.modes`. Tool-to-mode mapping can be overridden to promote/restrict tools.

- **readonly** (default): `ping`, `get_mode`, `set_mode`, `app.list_containers`, `app.list`, `app.get`, `app.search`
- **create**: + `app.create`, `app.action`, `applescript.run_template`
- **full**: + `app.update`, `app.delete`, `applescript.run_script` (all require user confirmation via MCP elicitation or confirmation token)

Mode changes use `RegisteredTool.enable()/disable()` and emit `notifications/tools/list_changed`.

## IPC Contract (Node ↔ Swift)

Request: `{ action: "template", templateId: "notes.create_note", bundleId: "com.apple.Notes", params: {...} }`

Response: `{ ok: true, result: {...}, humanSummary: "..." }` or `{ ok: false, error: { code: "AUTOMATION_DENIED", message: "..." } }`

Error codes: `AUTOMATION_DENIED`, `APP_NOT_RUNNING`, `SCRIPT_ERROR`, `TIMEOUT`, `INVALID_REQUEST`, `EXECUTOR_FAILED`, `POLICY_DENIED`, `CONFIG_ERROR`, `UNKNOWN_ERROR`

## Key Conventions

### TypeScript
- **Testing**: `node:test` (no external frameworks). Tests use `describe`/`it` with `node:assert/strict`.
- **Validation**: All tool inputs validated with Zod schemas (max-length constraints enforced).
- **Errors**: Use `McpAppleScriptError` with typed error codes. Subclasses: `PolicyDeniedError`, `ExecutorError`, `ConfigError`.
- **Formatting**: Prettier — double quotes, semicolons, 100 char width, trailing commas `es5`.
- **Module system**: ESM (`"type": "module"`), `.js` extensions in imports. Target ES2022, `Node16` module resolution.
- **Strict TS**: `strict`, `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`, `noUncheckedIndexedAccess`.

### Swift
- Swift 6.0 toolchain, macOS 12+ target.
- One `{App}Templates.swift` per app. Each has a `static func build(templateId:bundleId:parameters:)`.
- Template dispatch in `AppleScriptRunner.buildTemplateScript()` routes by template ID prefix.
- All AppleScript parameters must be escaped/sanitized in templates.

### Template ID Convention
Template IDs follow `{appPrefix}.{operation}` format: `notes.create_note`, `calendar.list_events`, `finder.move_item`. The prefix must match the adapter's `info.name`.

## Adding a New App Adapter

1. Create `packages/mcp-server/src/adapters/{app}.ts` implementing `ResourceAdapter`
2. Register it in `packages/mcp-server/src/adapters/index.ts` and in `createServer()` in `server.ts`
3. Create `packages/executor-swift/Sources/Executor/{App}Templates.swift` with `static func build(...)`
4. Add the prefix case to `AppleScriptRunner.buildTemplateScript()`
5. Add app config and policy entries
6. Write unit tests in `test/unit/adapters.test.ts`

## CI

GitHub Actions on `macos-latest` runs: lint → build → unit tests → `swift build -c release` → `swift test` → integration tests.
